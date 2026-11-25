import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError } from "@/lib/api-helpers";
import { startOfMonth } from "@/lib/money";
import { FollowUpDTO } from "@/lib/types";

/**
 * Four-day purchase follow-up centre data:
 * - due: pending follow-ups whose due date has arrived
 * - upcoming: pending but not yet due
 * - recent: resolved in the last 30 days
 */
export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();

    const rows = await db.followUp.findMany({
      where: { userId: user.id },
      include: {
        transaction: { include: { card: { select: { label: true, last4: true } }, account: { select: { name: true } } } },
      },
      orderBy: { dueAt: "asc" },
    });

    const toDTO = (f: (typeof rows)[number]): FollowUpDTO => ({
      id: f.id,
      transactionId: f.transactionId,
      dueAt: f.dueAt.toISOString(),
      status: f.status as FollowUpDTO["status"],
      orderReceived: f.orderReceived,
      note: f.note,
      createdAt: f.createdAt.toISOString(),
      resolvedAt: f.resolvedAt?.toISOString() ?? null,
      transaction: {
        id: f.transaction.id,
        accountId: f.transaction.accountId,
        cardId: f.transaction.cardId,
        direction: f.transaction.direction as "DEBIT" | "CREDIT",
        amountMinor: f.transaction.amountMinor,
        currency: f.transaction.currency,
        merchantName: f.transaction.merchantName,
        merchantCategory: f.transaction.merchantCategory,
        category: f.transaction.category,
        status: f.transaction.status as never,
        method: f.transaction.method as never,
        orderRef: f.transaction.orderRef,
        description: f.transaction.description,
        refundedMinor: f.transaction.refundedMinor,
        isDemo: f.transaction.isDemo,
        createdAt: f.transaction.createdAt.toISOString(),
        postedAt: f.transaction.postedAt?.toISOString() ?? null,
        cardLabel: f.transaction.card?.label ?? null,
        cardLast4: f.transaction.card?.last4 ?? null,
        accountName: f.transaction.account?.name,
      },
      daysRemaining: Math.ceil((f.dueAt.getTime() - now.getTime()) / 86_400_000),
      isDue: f.dueAt.getTime() <= now.getTime(),
    });

    const due = rows.filter((f) => f.status === "PENDING" && f.dueAt.getTime() <= now.getTime()).map(toDTO);
    const upcoming = rows.filter((f) => f.status === "PENDING" && f.dueAt.getTime() > now.getTime()).map(toDTO);
    const resolved = rows
      .filter((f) => f.status === "RESOLVED" && (now.getTime() - f.resolvedAt!.getTime()) < 30 * 86_400_000)
      .map(toDTO);

    void startOfMonth;
    return ok({ due, upcoming, resolved });
  } catch (err) {
    return mapError(err);
  }
}
