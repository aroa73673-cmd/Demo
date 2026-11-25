import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { budgetSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { startOfMonth } from "@/lib/money";
import { BudgetDTO } from "@/lib/types";

export async function GET() {
  try {
    const user = await requireUser();
    const budgets = await db.budget.findMany({ where: { userId: user.id }, orderBy: { category: "asc" } });
    const now = new Date();
    const out: BudgetDTO[] = [];
    for (const b of budgets) {
      const agg = await db.transaction.aggregate({
        where: {
          userId: user.id,
          category: b.category,
          direction: "DEBIT",
          status: { in: ["PENDING", "COMPLETED", "DISPUTED", "PARTIALLY_REFUNDED", "REFUNDED"] },
          createdAt: { gte: startOfMonth(now) },
        },
        _sum: { amountMinor: true },
      });
      const spent = agg._sum.amountMinor ?? 0;
      out.push({
        id: b.id,
        category: b.category,
        monthlyLimitMinor: b.monthlyLimitMinor,
        spentThisMonthMinor: spent,
      });
    }
    return ok({ budgets: out });
  } catch (err) {
    return mapError(err);
  }
}

/** Upsert a category budget. Breaches raise an explainable BUDGET_LIMIT alert on the next relevant transaction. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "budget-set", 30, 60_000, user.id);
    const input = await parseBody(req, budgetSchema);
    const budget = await db.budget.upsert({
      where: { userId_category: { userId: user.id, category: input.category } },
      create: { userId: user.id, category: input.category, monthlyLimitMinor: input.monthlyLimitMinor },
      update: { monthlyLimitMinor: input.monthlyLimitMinor },
    });
    await audit("BUDGET_SET", `${input.category}: monthly budget ${(input.monthlyLimitMinor / 100).toFixed(2)}`, user.id);
    return ok({ budget: { id: budget.id, category: budget.category, monthlyLimitMinor: budget.monthlyLimitMinor } }, 201);
  } catch (err) {
    return mapError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return fail(400, "Budget id is required.");
    const b = await db.budget.findFirst({ where: { id, userId: user.id } });
    if (!b) return fail(404, "Budget not found.");
    await db.budget.delete({ where: { id } });
    await audit("BUDGET_REMOVED", `${b.category} budget removed`, user.id);
    return ok({ removed: id });
  } catch (err) {
    return mapError(err);
  }
}
