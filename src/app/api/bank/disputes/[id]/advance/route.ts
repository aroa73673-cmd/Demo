import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { disputeAdvanceSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

/**
 * Advance the dispute through its lifecycle. This mirrors how a real dispute
 * desk progresses a case: SUBMITTED -> UNDER_REVIEW -> PROVISIONAL_CREDIT ->
 * RESOLVED_WON / RESOLVED_LOST. In this demo environment the progression is a
 * user-driven simulation, clearly labelled; no funds are actually moved.
 */
const FLOW: Record<string, string> = {
  SUBMITTED: "UNDER_REVIEW",
  UNDER_REVIEW: "PROVISIONAL_CREDIT",
  PROVISIONAL_CREDIT: "RESOLVED_WON",
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "dispute-advance", 20, 60_000, user.id);
    const { id } = await ctx.params;
    const input = await parseBody(req, disputeAdvanceSchema);

    const dispute = await db.dispute.findFirst({ where: { id, userId: user.id } });
    if (!dispute) return fail(404, "Dispute not found.");
    const next = FLOW[dispute.status];
    if (!next) return fail(409, `Dispute is already final (${dispute.status}).`);

    const timeline = JSON.parse(dispute.timeline) as { at: string; event: string; detail: string }[];
    const eventDetails: Record<string, string> = {
      UNDER_REVIEW: "Case assigned to the dispute team. Merchant asked to provide evidence (tracking, invoice, correspondence).",
      PROVISIONAL_CREDIT: "Provisional credit applied while the investigation continues. Final outcome still pending.",
      RESOLVED_WON: "Resolved in your favour. Refund posted to the card (demo environment: no real funds move).",
    };
    timeline.push({
      at: new Date().toISOString(),
      event: next,
      detail: eventDetails[next] + (input.note ? ` — ${input.note}` : ""),
    });

    const updated = await db.$transaction(async (tx) => {
      const d = await tx.dispute.update({
        where: { id },
        data: { status: next, timeline: JSON.stringify(timeline) },
      });
      if (next === "RESOLVED_WON") {
        const txn = await tx.transaction.findUnique({ where: { id: dispute.transactionId } });
        if (txn && txn.status !== "REFUNDED" && txn.refundedMinor < txn.amountMinor) {
          await tx.transaction.update({
            where: { id: txn.id },
            data: { status: "REFUNDED", refundedMinor: txn.amountMinor },
          });
        }
      }
      return d;
    });

    await audit("DISPUTE_ADVANCED", `Dispute ${id}: ${dispute.status} -> ${next}`, user.id);
    return ok({ dispute: { ...updated, timeline: JSON.parse(updated.timeline), createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() } });
  } catch (err) {
    return mapError(err);
  }
}
