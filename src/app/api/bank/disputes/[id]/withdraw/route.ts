import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, enforceRateLimit, fail } from "@/lib/api-helpers";
import { audit } from "@/lib/audit";

/** Withdraw an open dispute (user's right at any point before resolution). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "dispute-withdraw", 20, 60_000, user.id);
    const { id } = await ctx.params;

    const dispute = await db.dispute.findFirst({ where: { id, userId: user.id } });
    if (!dispute) return fail(404, "Dispute not found.");
    if (!["SUBMITTED", "UNDER_REVIEW", "PROVISIONAL_CREDIT"].includes(dispute.status)) {
      return fail(409, `Dispute is already final (${dispute.status}).`);
    }

    const timeline = JSON.parse(dispute.timeline) as { at: string; event: string; detail: string }[];
    timeline.push({ at: new Date().toISOString(), event: "WITHDRAWN", detail: "Withdrawn by the account holder." });

    const updated = await db.$transaction(async (tx) => {
      const d = await tx.dispute.update({
        where: { id },
        data: { status: "WITHDRAWN", timeline: JSON.stringify(timeline) },
      });
      // Restore transaction status: if no confirmed refunds exist it returns to COMPLETED.
      const txn = await tx.transaction.findUnique({ where: { id: dispute.transactionId } });
      if (txn && txn.status === "DISPUTED") {
        await tx.transaction.update({ where: { id: txn.id }, data: { status: "COMPLETED" } });
      }
      return d;
    });

    await audit("DISPUTE_WITHDRAWN", `Dispute ${id} withdrawn`, user.id);
    return ok({ dispute: { ...updated, timeline: JSON.parse(updated.timeline), createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() } });
  } catch (err) {
    return mapError(err);
  }
}
