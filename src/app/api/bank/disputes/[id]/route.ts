import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, fail } from "@/lib/api-helpers";
import { DisputeDTO } from "@/lib/types";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const d = await db.dispute.findFirst({ where: { id, userId: user.id }, include: { transaction: true } });
    if (!d) return fail(404, "Dispute not found.");
    return ok({
      dispute: {
        id: d.id,
        transactionId: d.transactionId,
        reason: d.reason,
        description: d.description,
        status: d.status,
        timeline: JSON.parse(d.timeline),
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        transaction: {
          id: d.transaction.id,
          accountId: d.transaction.accountId,
          cardId: d.transaction.cardId,
          direction: d.transaction.direction,
          amountMinor: d.transaction.amountMinor,
          currency: d.transaction.currency,
          merchantName: d.transaction.merchantName,
          merchantCategory: d.transaction.merchantCategory,
          category: d.transaction.category,
          status: d.transaction.status,
          method: d.transaction.method,
          orderRef: d.transaction.orderRef,
          description: d.transaction.description,
          refundedMinor: d.transaction.refundedMinor,
          isDemo: d.transaction.isDemo,
          createdAt: d.transaction.createdAt.toISOString(),
          postedAt: d.transaction.postedAt?.toISOString() ?? null,
        },
      } as DisputeDTO,
    });
  } catch (err) {
    return mapError(err);
  }
}
