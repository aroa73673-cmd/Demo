import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { refundCreateSchema, refundResolveSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { Refund } from "@prisma/client";

function refundDTO(r: Refund) {
  return {
    id: r.id,
    transactionId: r.transactionId,
    amountMinor: r.amountMinor,
    status: r.status,
    providerRef: r.providerRef,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  };
}

/** Request a refund for a transaction (records YOUR refund claim; merchant/provider confirmation is a separate, explicit step). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "refund-create", 30, 60_000, user.id);
    const { id } = await ctx.params;
    const input = await parseBody(req, refundCreateSchema);

    const txn = await db.transaction.findFirst({ where: { id, userId: user.id } });
    if (!txn) return fail(404, "Transaction not found.");
    if (txn.direction !== "DEBIT") return fail(400, "Refunds apply to outgoing payments only.");
    if (!["COMPLETED", "PARTIALLY_REFUNDED", "PENDING"].includes(txn.status)) {
      return fail(409, `A refund cannot be requested for a transaction with status ${txn.status}.`);
    }
    const remaining = txn.amountMinor - txn.refundedMinor;
    if (input.amountMinor > remaining) {
      return fail(400, `Refund amount exceeds the refundable balance of ${(remaining / 100).toFixed(2)}.`);
    }
    const openRefund = await db.refund.findFirst({ where: { transactionId: id, status: "REQUESTED" } });
    if (openRefund) return fail(409, "A refund is already in REQUESTED state for this transaction.");

    const refund = await db.refund.create({
      data: {
        userId: user.id,
        transactionId: id,
        amountMinor: input.amountMinor,
        status: "REQUESTED",
        note: input.note || null,
      },
    });
    await audit("REFUND_REQUESTED", `Refund ${(input.amountMinor / 100).toFixed(2)} requested on ${txn.merchantName} (demo declaration)`, user.id);
    return ok({ refund: refundDTO(refund) }, 201);
  } catch (err) {
    return mapError(err);
  }
}

/**
 * Resolve a refund: CONFIRMED (merchant/provider actually confirmed — you attest this
 * happened), DECLINED or CANCELLED. Confirmation updates the transaction's refunded
 * total and status. The UI labels this clearly as a user declaration, not a live
 * provider webhook.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "refund-resolve", 30, 60_000, user.id);
    const { id } = await ctx.params;
    const input = await parseBody(req, refundResolveSchema);

    const refund = await db.refund.findFirst({ where: { id: input.refundId, transactionId: id, userId: user.id }, include: { transaction: true } });
    if (!refund) return fail(404, "Refund not found for this transaction.");
    if (refund.status !== "REQUESTED") return fail(409, "Only REQUESTED refunds can be resolved.");

    const updated = await db.$transaction(async (tx) => {
      const r = await tx.refund.update({
        where: { id: input.refundId },
        data: {
          status: input.status,
          providerRef: input.providerRef || null,
          note: input.note ? `${refund.note ? refund.note + " — " : ""}${input.note}` : refund.note,
          resolvedAt: new Date(),
        },
      });
      if (input.status === "CONFIRMED") {
        const txn = refund.transaction;
        const newRefunded = txn.refundedMinor + r.amountMinor;
        const status = newRefunded >= txn.amountMinor ? "REFUNDED" : "PARTIALLY_REFUNDED";
        await tx.transaction.update({ where: { id: txn.id }, data: { refundedMinor: newRefunded, status } });
      }
      return r;
    });

    await audit("REFUND_RESOLVED", `Refund ${input.refundId} -> ${input.status}${input.providerRef ? ` (${input.providerRef})` : ""}`, user.id);
    return ok({ refund: refundDTO(updated) });
  } catch (err) {
    return mapError(err);
  }
}
