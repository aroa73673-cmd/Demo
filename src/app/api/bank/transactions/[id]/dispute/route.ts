import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { disputeCreateSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

/**
 * Open a dispute. The user must confirm the dispute is genuine (checkbox) —
 * this is an integrity control, not a formality: disputing legitimate completed
 * purchases improperly can constitute abuse in real banking.
 * The dispute starts SUBMITTED and is progressed through the state machine in
 * /disputes/[id]/advance. No automatic reversal is ever performed.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "dispute-create", 10, 60_000, user.id);
    const { id } = await ctx.params;
    const input = await parseBody(req, disputeCreateSchema);

    const txn = await db.transaction.findFirst({ where: { id, userId: user.id } });
    if (!txn) return fail(404, "Transaction not found.");
    if (txn.direction !== "DEBIT") return fail(400, "Disputes apply to outgoing payments only.");
    const existingOpen = await db.dispute.findFirst({
      where: { transactionId: id, status: { in: ["SUBMITTED", "UNDER_REVIEW", "PROVISIONAL_CREDIT"] } },
    });
    if (existingOpen) return fail(409, "This transaction already has an open dispute.");

    const nowIso = new Date().toISOString();
    const timeline = [
      {
        at: nowIso,
        event: "DISPUTE_SUBMITTED",
        detail: `Reason: ${input.reason}. Submitted by the account holder with genuine-issue confirmation.`,
      },
    ];
    const dispute = await db.dispute.create({
      data: {
        userId: user.id,
        transactionId: id,
        reason: input.reason,
        description: input.description,
        status: "SUBMITTED",
        timeline: JSON.stringify(timeline),
      },
    });
    await db.transaction.update({ where: { id }, data: { status: "DISPUTED" } });
    await audit("DISPUTE_SUBMITTED", `Dispute ${input.reason} on ${txn.merchantName} (${(txn.amountMinor / 100).toFixed(2)})`, user.id);
    return ok({ dispute: { ...dispute, timeline, createdAt: dispute.createdAt.toISOString(), updatedAt: dispute.updatedAt.toISOString() } }, 201);
  } catch (err) {
    return mapError(err);
  }
}
