/**
 * NEXUS BANK — transaction intelligence.
 *
 * Two deterministic, explainable subsystems:
 *
 * 1) POLICY ENGINE (pre-transaction): evaluates user-configured controls for a
 *    hypothetical FUTURE transaction (frozen card, online disabled, blocked
 *    merchant, per-transaction / daily / monthly limits, merchant monthly cap).
 *    This powers "declining or blocking future transactions". The response is
 *    always a structured decision with a human-readable reason — it is the
 *    platform enforcing the USER'S OWN controls inside the demo environment.
 *
 * 2) ALERT RULES (post-transaction): duplicate detection, unusual spend,
 *    new recurring payments, merchant risk indicators, budget breaches.
 *    Every alert carries an `explanation` naming the exact basis (averages,
 *    windows, matched rule). Nothing is ever labelled "fraud confirmed".
 */
import { db } from "@/lib/db";
import { merchantKey } from "@/lib/validation";
import { startOfDay, startOfMonth } from "@/lib/money";

// ---------- Policy engine ----------

export type PolicyContext = {
  userId: string;
  accountId: string;
  cardId?: string | null;
  amountMinor: number;
  method: string;
  merchantName: string;
  currency: string;
};

export type PolicyCheck = { name: string; result: "PASS" | "FAIL"; detail: string };

export type PolicyDecision =
  | { allowed: true; checks: PolicyCheck[] }
  | {
      allowed: false;
      declinedBy: string;
      reason: string;
      checks: PolicyCheck[];
    };

export async function evaluatePolicy(ctx: PolicyContext): Promise<PolicyDecision> {
  const checks: { name: string; result: "PASS" | "FAIL"; detail: string }[] = [];

  const decline = (declinedBy: string, reason: string): PolicyDecision => ({
    allowed: false,
    declinedBy,
    reason,
    checks,
  });

  // Card checks
  if (ctx.cardId) {
    const card = await db.card.findFirst({ where: { id: ctx.cardId, userId: ctx.userId } });
    if (!card) {
      checks.push({ name: "CARD_EXISTS", result: "FAIL", detail: "Card not found for this account." });
      return decline("CARD_NOT_FOUND", "The selected card does not exist or is not available.");
    }
    if (card.status === "FROZEN") {
      checks.push({ name: "CARD_STATUS", result: "FAIL", detail: `Card "${card.label}" is frozen by the cardholder.` });
      return decline("CARD_FROZEN", "Card is frozen. Unfreeze it in Card Management before using it.");
    }
    if (card.status !== "ACTIVE") {
      checks.push({ name: "CARD_STATUS", result: "FAIL", detail: `Card status is ${card.status}.` });
      return decline("CARD_NOT_ACTIVE", "Card is not active (status: " + card.status + ").");
    }
    if (ctx.method === "ONLINE" && !card.onlineAllowed) {
      checks.push({ name: "ONLINE_PERMISSION", result: "FAIL", detail: "Online payments are switched off for this card." });
      return decline("ONLINE_DISABLED", "Online payments are disabled for this card. Enable them in Card Management.");
    }
    if (ctx.method === "POS" && !card.contactlessAllowed && ctx.amountMinor <= 10000) {
      checks.push({ name: "CONTACTLESS_PERMISSION", result: "FAIL", detail: "Contactless is switched off for this card." });
      return decline("CONTACTLESS_DISABLED", "Contactless payments are disabled for this card.");
    }
    if (ctx.currency !== "GBP" && !card.internationalAllowed) {
      checks.push({ name: "INTERNATIONAL_PERMISSION", result: "FAIL", detail: "International payments are switched off for this card." });
      return decline("INTERNATIONAL_DISABLED", "International payments are disabled for this card.");
    }
    if (ctx.method === "ATM" && !card.atmAllowed) {
      checks.push({ name: "ATM_PERMISSION", result: "FAIL", detail: "ATM withdrawals are switched off for this card." });
      return decline("ATM_DISABLED", "ATM withdrawals are disabled for this card.");
    }
    if (ctx.amountMinor > card.perTxLimitMinor) {
      checks.push({ name: "PER_TX_LIMIT", result: "FAIL", detail: `Amount exceeds the per-transaction limit of ${(card.perTxLimitMinor / 100).toFixed(2)}.` });
      return decline("PER_TX_LIMIT", "Amount exceeds this card's per-transaction limit.");
    }

    const now = new Date();
    const dayTotal = await db.transaction.aggregate({
      where: {
        userId: ctx.userId,
        cardId: ctx.cardId,
        direction: "DEBIT",
        status: { in: ["PENDING", "COMPLETED", "DISPUTED", "PARTIALLY_REFUNDED", "REFUNDED"] },
        createdAt: { gte: startOfDay(now) },
      },
      _sum: { amountMinor: true },
    });
    const daySum = dayTotal._sum.amountMinor ?? 0;
    if (daySum + ctx.amountMinor > card.dailyLimitMinor) {
      checks.push({ name: "DAILY_LIMIT", result: "FAIL", detail: `Daily limit ${(card.dailyLimitMinor / 100).toFixed(2)} would be exceeded (already used ${(daySum / 100).toFixed(2)} today).` });
      return decline("DAILY_LIMIT", "This card's daily spending limit would be exceeded.");
    }

    const monthTotal = await db.transaction.aggregate({
      where: {
        userId: ctx.userId,
        cardId: ctx.cardId,
        direction: "DEBIT",
        status: { in: ["PENDING", "COMPLETED", "DISPUTED", "PARTIALLY_REFUNDED", "REFUNDED"] },
        createdAt: { gte: startOfMonth(now) },
      },
      _sum: { amountMinor: true },
    });
    const monthSum = monthTotal._sum.amountMinor ?? 0;
    if (monthSum + ctx.amountMinor > card.monthlyLimitMinor) {
      checks.push({ name: "MONTHLY_LIMIT", result: "FAIL", detail: `Monthly limit ${(card.monthlyLimitMinor / 100).toFixed(2)} would be exceeded (used ${(monthSum / 100).toFixed(2)}).` });
      return decline("MONTHLY_LIMIT", "This card's monthly spending limit would be exceeded.");
    }
  }

  // Merchant rule checks
  const mKey = merchantKey(ctx.merchantName);
  if (mKey) {
    const rule = await db.merchantRule.findUnique({
      where: { userId_name: { userId: ctx.userId, name: mKey } },
    });
    if (rule?.blocked) {
      checks.push({ name: "MERCHANT_BLOCKED", result: "FAIL", detail: `Merchant "${rule.displayName}" is on the blocked list.` });
      return decline("MERCHANT_BLOCKED", `Payments to ${rule.displayName} are blocked by your merchant restrictions.`);
    }
    if (rule?.monthlyLimitMinor != null) {
      const now = new Date();
      const merchantMonthTotal = await db.transaction.aggregate({
        where: {
          userId: ctx.userId,
          merchantName: { contains: rule.displayName },
          direction: "DEBIT",
          status: { in: ["PENDING", "COMPLETED", "DISPUTED", "PARTIALLY_REFUNDED", "REFUNDED"] },
          createdAt: { gte: startOfMonth(now) },
        },
        _sum: { amountMinor: true },
      });
      const mSum = merchantMonthTotal._sum.amountMinor ?? 0;
      if (mSum + ctx.amountMinor > rule.monthlyLimitMinor) {
        checks.push({ name: "MERCHANT_MONTHLY_LIMIT", result: "FAIL", detail: `Merchant monthly cap ${(rule.monthlyLimitMinor / 100).toFixed(2)} would be exceeded (used ${(mSum / 100).toFixed(2)}).` });
        return decline("MERCHANT_MONTHLY_LIMIT", `Monthly cap for ${rule.displayName} would be exceeded.`);
      }
      checks.push({ name: "MERCHANT_MONTHLY_LIMIT", result: "PASS", detail: `Merchant cap ${(rule.monthlyLimitMinor / 100).toFixed(2)}: used ${(mSum / 100).toFixed(2)}.` });
    }
  }

  return { allowed: true, checks };
}

// ---------- Alert rules ----------

export type AlertDraft = {
  type: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  title: string;
  explanation: string;
  transactionId?: string;
};

const RISKY_MERCHANT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /(crypto|coin|btc|exchange)/i, label: "crypto asset platform" },
  { re: /(gambling|bet|casino|poker|slots)/i, label: "gambling operator" },
  { re: /(wire|remittance|forex)/i, label: "money transfer service" },
  { re: /(unknown merchant|merchant \d)/i, label: "unclear merchant descriptor" },
];

export async function runIntelligenceRules(params: {
  userId: string;
  transactionId: string;
  amountMinor: number;
  currency: string;
  merchantName: string;
  category: string;
  method: string;
  cardId?: string | null;
}): Promise<AlertDraft[]> {
  const drafts: AlertDraft[] = [];
  const { userId, amountMinor, currency, merchantName, category, method, cardId, transactionId } = params;
  const now = new Date();

  // Rule 1 — duplicate detection: same merchant + amount within 120 seconds
  const dupSince = new Date(now.getTime() - 120_000);
  const dup = await db.transaction.findFirst({
    where: {
      userId,
      merchantName: merchantName,
      amountMinor,
      direction: "DEBIT",
      id: { not: transactionId },
      createdAt: { gte: dupSince },
    },
    select: { id: true, createdAt: true },
  });
  if (dup) {
    drafts.push({
      type: "DUPLICATE_RECENT",
      severity: "WARN",
      title: "Possible duplicate payment",
      explanation:
        `A payment of ${(amountMinor / 100).toFixed(2)} ${currency} to ${merchantName} was recorded ` +
        `${Math.max(1, Math.round((now.getTime() - dup.createdAt.getTime()) / 1000))}s earlier. ` +
        "Rule: identical merchant + amount within a 120-second window. Verify whether this is a genuine repeat before disputing.",
      transactionId,
    });
  }

  if (method !== "TRANSFER") {
    // Rule 2 — unusual spend vs category baseline (needs >= 3 prior transactions)
    const agg = await db.transaction.aggregate({
      where: { userId, category, direction: "DEBIT", id: { not: transactionId }, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
      _avg: { amountMinor: true },
      _count: true,
    });
    const count = agg._count;
    const avg = agg._avg.amountMinor;
    if (count >= 3 && avg != null && amountMinor > avg * 2.5 && amountMinor > 5000) {
      drafts.push({
        type: "UNUSUAL_SPEND",
        severity: "WARN",
        title: "Unusual amount for this category",
        explanation:
          `This ${category} transaction of ${(amountMinor / 100).toFixed(2)} ${currency} is ` +
          `${(amountMinor / avg).toFixed(1)}x your average ${category} spend of ${(avg / 100).toFixed(2)} ` +
          `across ${count} prior transactions. This is a statistical signal, not evidence of fraud.`,
        transactionId,
      });
    }

    // Rule 3 — new recurring payment (subscription method, merchant not seen as subscription in 35 days)
    if (method === "SUBSCRIPTION") {
      const since = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
      const prior = await db.transaction.findFirst({
        where: { userId, merchantName, method: "SUBSCRIPTION", id: { not: transactionId }, createdAt: { gte: since } },
        select: { id: true },
      });
      if (!prior) {
        drafts.push({
          type: "NEW_RECURRING",
          severity: "INFO",
          title: "New recurring payment pattern",
          explanation:
            `First subscription-style payment to ${merchantName} in the last 35 days. ` +
            "Recurring charges renew automatically until cancelled — check the merchant's cancellation policy.",
          transactionId,
        });
      }
    }

    // Rule 4 — merchant risk indicator (category-based, never an accusation)
    const matched = RISKY_MERCHANT_PATTERNS.find((p) => p.re.test(merchantName));
    if (matched) {
      drafts.push({
        type: "MERCHANT_RISK",
        severity: "INFO",
        title: "Merchant risk indicator",
        explanation:
          `Merchant descriptor matched the "${matched.label}" pattern. Transactions with this merchant type ` +
          "historically show higher dispute rates industry-wide. This is informational — the merchant is not accused of anything.",
        transactionId,
      });
    }
  }

  // Rule 5 — budget breach (category monthly total after this transaction)
  const budget = await db.budget.findUnique({
    where: { userId_category: { userId, category } },
  });
  if (budget && method !== "TRANSFER") {
    const monthTotal = await db.transaction.aggregate({
      where: {
        userId,
        category,
        direction: "DEBIT",
        status: { in: ["PENDING", "COMPLETED", "DISPUTED", "PARTIALLY_REFUNDED", "REFUNDED"] },
        createdAt: { gte: startOfMonth(now) },
      },
      _sum: { amountMinor: true },
    });
    const sum = monthTotal._sum.amountMinor ?? 0;
    if (sum > budget.monthlyLimitMinor) {
      drafts.push({
        type: "BUDGET_LIMIT",
        severity: "WARN",
        title: `Budget exceeded for ${category}`,
        explanation:
          `Month-to-date ${category} spending is ${(sum / 100).toFixed(2)}, which is ` +
          `${((sum - budget.monthlyLimitMinor) / 100).toFixed(2)} over your ${(budget.monthlyLimitMinor / 100).toFixed(2)} monthly budget. ` +
          "Includes this transaction and all recorded activity in the category.",
        transactionId,
      });
    }
  }

  // Rule 6 — card daily limit proximity (>= 80% used today)
  if (cardId) {
    const card = await db.card.findFirst({ where: { id: cardId, userId } });
    if (card) {
      const dayTotal = await db.transaction.aggregate({
        where: {
          userId,
          cardId,
          direction: "DEBIT",
          status: { in: ["PENDING", "COMPLETED", "DISPUTED", "PARTIALLY_REFUNDED", "REFUNDED"] },
          createdAt: { gte: startOfDay(now) },
        },
        _sum: { amountMinor: true },
      });
      const sum = dayTotal._sum.amountMinor ?? 0;
      if (card.dailyLimitMinor > 0 && sum >= card.dailyLimitMinor * 0.8) {
        drafts.push({
          type: "CARD_LIMIT",
          severity: "INFO",
          title: `Approaching daily limit on ${card.label}`,
          explanation:
            `Today's spending on this card is ${(sum / 100).toFixed(2)} of the ${(card.dailyLimitMinor / 100).toFixed(2)} daily limit ` +
            `(${Math.round((sum / card.dailyLimitMinor) * 100)}% used). Transactions above the remaining allowance will be declined by your card controls.`,
          transactionId,
        });
      }
    }
  }

  return drafts;
}

/** Persist generated alerts (idempotent per transaction+type within 10 minutes). */
export async function persistAlerts(userId: string, drafts: AlertDraft[]): Promise<number> {
  let created = 0;
  const since = new Date(Date.now() - 10 * 60_000);
  for (const d of drafts) {
    const existing = await db.alert.findFirst({
      where: { userId, type: d.type, transactionId: d.transactionId ?? null, createdAt: { gte: since } },
      select: { id: true },
    });
    if (existing) continue;
    await db.alert.create({
      data: {
        userId,
        type: d.type,
        severity: d.severity,
        title: d.title,
        explanation: d.explanation,
        transactionId: d.transactionId ?? null,
      },
    });
    created += 1;
  }
  return created;
}
