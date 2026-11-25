import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { statusUpdateSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

/**
 * Confirm a pending payment as completed / mark declined / cancel.
 * IMPORTANT (honesty contract): the user can only declare the settlement state
 * of payments recorded in THIS demo environment. The response is labelled so
 * the UI never presents this as an external provider confirmation.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "txn-status", 60, 60_000, user.id);
    const { id } = await ctx.params;
    const input = await parseBody(req, statusUpdateSchema);

    const txn = await db.transaction.findFirst({ where: { id, userId: user.id } });
    if (!txn) return fail(404, "Transaction not found.");
    if (txn.status !== "PENDING") {
      return fail(409, `Only PENDING transactions can be updated (current status: ${txn.status}).`);
    }

    const updated = await db.transaction.update({
      where: { id },
      data: { status: input.status, postedAt: input.status === "COMPLETED" ? new Date() : txn.postedAt },
    });
    await audit(
      "TXN_STATUS_UPDATED",
      `${txn.merchantName}: ${txn.status} -> ${input.status} (declared in demo by account holder)${input.note ? ` — ${input.note}` : ""}`,
      user.id,
    );
    return ok({ transaction: { ...updated, createdAt: updated.createdAt.toISOString(), postedAt: updated.postedAt?.toISOString() ?? null } });
  } catch (err) {
    return mapError(err);
  }
}
