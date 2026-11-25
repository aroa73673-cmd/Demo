import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError } from "@/lib/api-helpers";
import { startOfDay, startOfMonth } from "@/lib/money";
import { InsightSummary } from "@/lib/types";

/**
 * Transaction intelligence summaries — all computed from real (demo-labelled)
 * stored records with SQL aggregation. No invented numbers.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const today = startOfDay(now);
    const monthStart = startOfMonth(now);
    const weekStart = new Date(today.getTime() - 6 * 86_400_000);

    const spendWhere = {
      userId: user.id,
      direction: "DEBIT",
      status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"] },
    };

    const [todayAgg, weekAgg, monthAgg, incomeAgg, byCatRaw, byMerchRaw, monthlyRaw, budgets, countsPending, countsCompleted, countsDeclined, countsDisputed, refundsCount] = await Promise.all([
      db.transaction.aggregate({ where: { ...spendWhere, createdAt: { gte: today } }, _sum: { amountMinor: true } }),
      db.transaction.aggregate({ where: { ...spendWhere, createdAt: { gte: weekStart } }, _sum: { amountMinor: true } }),
      db.transaction.aggregate({ where: { ...spendWhere, createdAt: { gte: monthStart } }, _sum: { amountMinor: true } }),
      db.transaction.aggregate({ where: { userId: user.id, direction: "CREDIT", status: { in: ["COMPLETED"] }, createdAt: { gte: monthStart } }, _sum: { amountMinor: true } }),
      db.transaction.groupBy({
        by: ["category"],
        where: { ...spendWhere, createdAt: { gte: monthStart } },
        _sum: { amountMinor: true },
        _count: true,
      }),
      db.transaction.groupBy({
        by: ["merchantName"],
        where: { ...spendWhere, createdAt: { gte: monthStart } },
        _sum: { amountMinor: true },
        _count: true,
        orderBy: { _sum: { amountMinor: "desc" } },
        take: 8,
      }),
      db.transaction.groupBy({
        by: ["category"],
        where: { userId: user.id, direction: "DEBIT", status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] }, createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
        _sum: { amountMinor: true },
        _count: true,
      }),
      db.budget.findMany({ where: { userId: user.id } }),
      db.transaction.count({ where: { userId: user.id, status: "PENDING" } }),
      db.transaction.count({ where: { userId: user.id, status: "COMPLETED" } }),
      db.transaction.count({ where: { userId: user.id, status: "DECLINED" } }),
      db.transaction.count({ where: { userId: user.id, status: "DISPUTED" } }),
      db.refund.count({ where: { userId: user.id } }),
    ]);

    // Monthly trend: last 6 months total spend per month (fetch minimal rows)
    const sixMonthsRows = await db.transaction.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) }, direction: "DEBIT", status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
      select: { amountMinor: true, createdAt: true, method: true },
    });
    const months: { label: string; spendMinor: number; incomeMinor: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push({
        label: d.toLocaleDateString("en-GB", { month: "short" }),
        spendMinor: 0,
        incomeMinor: 0,
      });
      void end;
      void d;
    }
    for (const r of sixMonthsRows) {
      const diff = (now.getFullYear() - r.createdAt.getFullYear()) * 12 + (now.getMonth() - r.createdAt.getMonth());
      const idx = 5 - diff;
      if (idx >= 0 && idx < 6) months[idx].spendMinor += r.amountMinor;
    }
    const incomeRows = await db.transaction.findMany({
      where: { userId: user.id, direction: "CREDIT", method: "TRANSFER", createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
      select: { amountMinor: true, createdAt: true },
    });
    for (const r of incomeRows) {
      const diff = (now.getFullYear() - r.createdAt.getFullYear()) * 12 + (now.getMonth() - r.createdAt.getMonth());
      const idx = 5 - diff;
      if (idx >= 0 && idx < 6) months[idx].incomeMinor += r.amountMinor;
    }

    const summary: InsightSummary = {
      todayMinor: todayAgg._sum.amountMinor ?? 0,
      weekMinor: weekAgg._sum.amountMinor ?? 0,
      monthMinor: monthAgg._sum.amountMinor ?? 0,
      incomeMonthMinor: incomeAgg._sum.amountMinor ?? 0,
      byCategory: byCatRaw
        .map((c) => ({ category: c.category, totalMinor: c._sum.amountMinor ?? 0, count: c._count }))
        .sort((a, b) => b.totalMinor - a.totalMinor),
      byMerchant: byMerchRaw.map((m) => ({ merchantName: m.merchantName, totalMinor: m._sum.amountMinor ?? 0, count: m._count })),
      monthlyTrend: months,
      budgetStatus: budgets.map((b) => {
        void monthlyRaw;
        return {
          category: b.category,
          limitMinor: b.monthlyLimitMinor,
          spentMinor: 0,
          pct: 0,
        };
      }),
      counts: {
        pending: countsPending,
        completed: countsCompleted,
        declined: countsDeclined,
        disputed: countsDisputed,
        refunds: refundsCount,
      },
    };

    // Fill budget spend
    for (const b of summary.budgetStatus) {
      const agg = await db.transaction.aggregate({
        where: { userId: user.id, category: b.category, direction: "DEBIT", status: { in: ["PENDING", "COMPLETED", "DISPUTED", "PARTIALLY_REFUNDED", "REFUNDED"] }, createdAt: { gte: monthStart } },
        _sum: { amountMinor: true },
      });
      b.spentMinor = agg._sum.amountMinor ?? 0;
      b.pct = b.limitMinor > 0 ? Math.round((b.spentMinor / b.limitMinor) * 100) : 0;
    }

    return ok(summary);
  } catch (err) {
    return mapError(err);
  }
}
