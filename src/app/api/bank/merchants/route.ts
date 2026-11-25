import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { merchantRuleSchema } from "@/lib/validation";
import { merchantKey } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { startOfMonth } from "@/lib/money";
import { MerchantRuleDTO } from "@/lib/types";

export async function GET() {
  try {
    const user = await requireUser();
    const rules = await db.merchantRule.findMany({
      where: { userId: user.id },
      orderBy: { displayName: "asc" },
    });
    const now = new Date();
    const out: MerchantRuleDTO[] = [];
    for (const r of rules) {
      const agg = await db.transaction.aggregate({
        where: {
          userId: user.id,
          merchantName: { contains: r.displayName },
          direction: "DEBIT",
          status: { in: ["PENDING", "COMPLETED", "DISPUTED", "PARTIALLY_REFUNDED", "REFUNDED"] },
          createdAt: { gte: startOfMonth(now) },
        },
        _sum: { amountMinor: true },
      });
      out.push({
        id: r.id,
        name: r.name,
        displayName: r.displayName,
        blocked: r.blocked,
        monthlyLimitMinor: r.monthlyLimitMinor,
        note: r.note,
        spentThisMonthMinor: agg._sum.amountMinor ?? 0,
      });
    }
    return ok({ rules: out });
  } catch (err) {
    return mapError(err);
  }
}

/** Create or update a merchant rule (block / monthly cap). Future payments against this merchant are declined by the policy engine. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "merchant-rule", 30, 60_000, user.id);
    const input = await parseBody(req, merchantRuleSchema);
    const key = merchantKey(input.displayName);

    const rule = await db.merchantRule.upsert({
      where: { userId_name: { userId: user.id, name: key } },
      create: {
        userId: user.id,
        name: key,
        displayName: input.displayName,
        blocked: input.blocked,
        monthlyLimitMinor: input.monthlyLimitMinor ?? null,
        note: input.note || null,
      },
      update: {
        blocked: input.blocked,
        monthlyLimitMinor: input.monthlyLimitMinor ?? null,
        note: input.note || null,
      },
    });
    await audit(
      "MERCHANT_RULE_SET",
      `Merchant ${rule.displayName}: ${rule.blocked ? "BLOCKED" : "allowed"}${rule.monthlyLimitMinor ? `, monthly cap ${(rule.monthlyLimitMinor / 100).toFixed(2)}` : ""}`,
      user.id,
    );
    return ok({ rule: { id: rule.id, name: rule.name, displayName: rule.displayName, blocked: rule.blocked, monthlyLimitMinor: rule.monthlyLimitMinor, note: rule.note } }, 201);
  } catch (err) {
    return mapError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return fail(400, "Rule id is required.");
    const rule = await db.merchantRule.findFirst({ where: { id, userId: user.id } });
    if (!rule) return fail(404, "Rule not found.");
    await db.merchantRule.delete({ where: { id } });
    await audit("MERCHANT_RULE_REMOVED", `Rule for ${rule.displayName} removed`, user.id);
    return ok({ removed: id });
  } catch (err) {
    return mapError(err);
  }
}
