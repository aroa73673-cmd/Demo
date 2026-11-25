import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError } from "@/lib/api-helpers";
import { OverviewDTO } from "@/lib/types";

/** Dashboard overview: balances, card stats, week spend, pending, due follow-ups, unread alerts, recent transactions. */
export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [accounts, cards, weekAgg, pending, followUpsRaw, unreadAlertsRaw, recent] = await Promise.all([
      db.account.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
      db.card.findMany({ where: { userId: user.id } }),
      db.transaction.aggregate({
        where: { userId: user.id, direction: "DEBIT", status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"] }, createdAt: { gte: weekAgo } },
        _sum: { amountMinor: true },
      }),
      db.transaction.findMany({ where: { userId: user.id, status: "PENDING" }, select: { amountMinor: true } }),
      db.followUp.findMany({
        where: { userId: user.id, status: "PENDING", dueAt: { lte: now } },
        include: { transaction: { include: { card: { select: { label: true, last4: true } }, account: { select: { name: true } } } } },
        orderBy: { dueAt: "asc" },
        take: 5,
      }),
      db.alert.findMany({ where: { userId: user.id, read: false }, orderBy: { createdAt: "desc" }, take: 5 }),
      db.transaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { card: { select: { label: true, last4: true } }, account: { select: { name: true } } },
      }),
    ]);

    const dto: OverviewDTO = {
      totalBalanceMinor: accounts.reduce((s, a) => s + a.balanceMinor, 0),
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type as "CURRENT" | "SAVINGS",
        currency: a.currency,
        balanceMinor: a.balanceMinor,
        isDemo: a.isDemo,
      })),
      cards: {
        total: cards.length,
        frozen: cards.filter((c) => c.status === "FROZEN").length,
        virtual: cards.filter((c) => c.kind === "VIRTUAL").length,
      },
      thisWeekSpendMinor: weekAgg._sum.amountMinor ?? 0,
      pendingCount: pending.length,
      pendingTotalMinor: pending.reduce((s, p) => s + p.amountMinor, 0),
      followUpsDue: followUpsRaw.map((f) => ({
        id: f.id,
        transactionId: f.transactionId,
        dueAt: f.dueAt.toISOString(),
        status: f.status as "PENDING" | "RESOLVED" | "CANCELLED",
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
      })),
      unreadAlerts: unreadAlertsRaw.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity as "INFO" | "WARN" | "CRITICAL",
        title: a.title,
        explanation: a.explanation,
        transactionId: a.transactionId,
        read: a.read,
        createdAt: a.createdAt.toISOString(),
      })),
      recentTransactions: recent.map((t) => ({
        id: t.id,
        accountId: t.accountId,
        cardId: t.cardId,
        direction: t.direction as "DEBIT" | "CREDIT",
        amountMinor: t.amountMinor,
        currency: t.currency,
        merchantName: t.merchantName,
        merchantCategory: t.merchantCategory,
        category: t.category,
        status: t.status as never,
        method: t.method as never,
        orderRef: t.orderRef,
        description: t.description,
        refundedMinor: t.refundedMinor,
        isDemo: t.isDemo,
        createdAt: t.createdAt.toISOString(),
        postedAt: t.postedAt?.toISOString() ?? null,
        cardLabel: t.card?.label ?? null,
        cardLast4: t.card?.last4 ?? null,
        accountName: t.account?.name,
      })),
      demoNotice:
        "All balances, cards and transactions in this environment are DEMO data generated for the sandbox. Nothing here is a real financial record.",
    };

    void 0;
    return ok(dto);
  } catch (err) {
    return mapError(err);
  }
}
