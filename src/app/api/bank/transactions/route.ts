import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit } from "@/lib/api-helpers";
import { transactionCreateSchema, merchantKey } from "@/lib/validation";
import { evaluatePolicy, runIntelligenceRules, persistAlerts, PolicyDecision } from "@/lib/intelligence";
import { audit } from "@/lib/audit";
import { sanitizeFreeText } from "@/lib/mask";
import { addDays } from "@/lib/money";
import { TransactionDTO, RecordPurchaseResponse, FOLLOW_UP_DAYS } from "@/lib/types";

type TxnRow = {
  id: string; accountId: string; cardId: string | null; direction: string; amountMinor: number;
  currency: string; merchantName: string; merchantCategory: string | null; category: string;
  status: string; method: string; orderRef: string | null; description: string | null;
  refundedMinor: number; isDemo: boolean; createdAt: Date; postedAt: Date | null;
  card?: { label: string; last4: string } | null;
  account?: { name: string } | null;
};

export function toTransactionDTO(t: TxnRow, extra?: { hasFollowUp?: boolean; disputeStatus?: string | null }): TransactionDTO {
  return {
    id: t.id,
    accountId: t.accountId,
    cardId: t.cardId,
    direction: t.direction as TransactionDTO["direction"],
    amountMinor: t.amountMinor,
    currency: t.currency,
    merchantName: t.merchantName,
    merchantCategory: t.merchantCategory,
    category: t.category,
    status: t.status as TransactionDTO["status"],
    method: t.method as TransactionDTO["method"],
    orderRef: t.orderRef,
    description: t.description,
    refundedMinor: t.refundedMinor,
    isDemo: t.isDemo,
    createdAt: t.createdAt.toISOString(),
    postedAt: t.postedAt?.toISOString() ?? null,
    cardLabel: t.card?.label ?? null,
    cardLast4: t.card?.last4 ?? null,
    accountName: t.account?.name ?? undefined,
    ...(extra ?? {}),
  };
}

/**
 * Search & filter transactions.
 * Params: q, status, method, category, cardId, accountId, from, to, page, pageSize, sort
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || null;
    const status = url.searchParams.get("status");
    const method = url.searchParams.get("method");
    const category = url.searchParams.get("category");
    const cardId = url.searchParams.get("cardId");
    const accountId = url.searchParams.get("accountId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(5, parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20));
    const sort = url.searchParams.get("sort") === "oldest" ? "asc" : "desc";

    const where: Record<string, unknown> = { userId: user.id };
    if (status && status !== "all") where.status = status;
    if (method && method !== "all") where.method = method;
    if (category && category !== "all") where.category = category;
    if (cardId && cardId !== "all") where.cardId = cardId;
    if (accountId && accountId !== "all") where.accountId = accountId;
    if (q) {
      where.OR = [
        { merchantName: { contains: q } },
        { orderRef: { contains: q } },
        { description: { contains: q } },
        { category: { contains: q } },
      ];
    }
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      db.transaction.findMany({
        where,
        orderBy: { createdAt: sort },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { card: { select: { label: true, last4: true } }, account: { select: { name: true } } },
      }),
      db.transaction.count({ where }),
    ]);

    // Attach follow-up & dispute flags for the visible page only.
    const txnIds = rows.map((r) => r.id);
    const [followUps, disputes] = await Promise.all([
      db.followUp.findMany({ where: { userId: user.id, transactionId: { in: txnIds }, status: "PENDING" }, select: { transactionId: true } }),
      db.dispute.findMany({ where: { userId: user.id, transactionId: { in: txnIds }, status: { notIn: ["WITHDRAWN", "RESOLVED_WON", "RESOLVED_LOST"] } }, select: { transactionId: true, status: true } }),
    ]);
    const followUpSet = new Set(followUps.map((f) => f.transactionId));
    const disputeMap = new Map(disputes.map((d) => [d.transactionId, d.status]));

    return ok({
      transactions: rows.map((r) =>
        toTransactionDTO(r as TxnRow, { hasFollowUp: followUpSet.has(r.id), disputeStatus: disputeMap.get(r.id) ?? null }),
      ),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * Record a payment / purchase. Runs the user's future-transaction controls
 * (policy engine) FIRST: frozen card, permission switches, merchant rules,
 * limits. A declined record keeps an audit trail of which control declined it.
 * Approved ONLINE purchases can create an optional 4-day follow-up.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "txn-create", 60, 60_000, user.id);
    const input = await parseBody(req, transactionCreateSchema);

    const account = await db.account.findFirst({ where: { id: input.accountId, userId: user.id } });
    if (!account) throw new HttpError(404, "Account not found.");
    if (input.cardId) {
      const card = await db.card.findFirst({ where: { id: input.cardId, userId: user.id } });
      if (!card) throw new HttpError(404, "Card not found.");
    }

    // 1) Policy evaluation (future-transaction controls)
    const decision: PolicyDecision = await evaluatePolicy({
      userId: user.id,
      accountId: input.accountId,
      cardId: input.cardId ?? null,
      amountMinor: input.amountMinor,
      method: input.method,
      merchantName: input.merchantName,
      currency: input.currency,
    });

    if (!decision.allowed) {
      // Record the declined attempt for transparency (never silently dropped).
      const declined = await db.transaction.create({
        data: {
          userId: user.id,
          accountId: input.accountId,
          cardId: input.cardId ?? null,
          direction: input.direction,
          amountMinor: input.amountMinor,
          currency: input.currency,
          merchantName: input.merchantName,
          category: input.category,
          status: "DECLINED",
          method: input.method,
          orderRef: input.orderRef || null,
          description: input.description
            ? `Declined by your card controls (${decision.declinedBy}): ${sanitizeFreeText(input.description)}`
            : `Declined by your card controls (${decision.declinedBy})`,
          isDemo: true,
        },
        include: { card: { select: { label: true, last4: true } }, account: { select: { name: true } } },
      });
      await audit(
        "TXN_DECLINED_POLICY",
        `${decision.declinedBy}: ${(input.amountMinor / 100).toFixed(2)} ${input.currency} to ${merchantKey(input.merchantName)}`,
        user.id,
      );
      const resp: RecordPurchaseResponse = {
        transaction: toTransactionDTO(declined as unknown as TxnRow),
        decision: "DECLINED",
        declinedBy: decision.declinedBy,
        reason: decision.reason,
        checks: decision.checks,
        followUp: null,
        alertsCreated: 0,
      };
      return ok(resp, 200); // 200: the request itself was valid; the CONTROL declined it
    }

    if (input.simulateDecline) {
      // Explicit user-requested simulation: shows how a network decline appears.
      const declined = await db.transaction.create({
        data: {
          userId: user.id,
          accountId: input.accountId,
          cardId: input.cardId ?? null,
          direction: input.direction,
          amountMinor: input.amountMinor,
          currency: input.currency,
          merchantName: input.merchantName,
          category: input.category,
          status: "DECLINED",
          method: input.method,
          orderRef: input.orderRef || null,
          description: "Simulated issuer decline (demo scenario, requested by you)",
          isDemo: true,
        },
        include: { card: { select: { label: true, last4: true } }, account: { select: { name: true } } },
      });
      const resp: RecordPurchaseResponse = {
        transaction: toTransactionDTO(declined as unknown as TxnRow),
        decision: "DECLINED",
        declinedBy: "SIMULATED_ISSUER",
        reason: "Simulated decline — this demo shows how a card decline appears in your history. No real payment network was involved.",
        checks: decision.checks,
        followUp: null,
        alertsCreated: 0,
      };
      return ok(resp, 200);
    }

    // 2) Create the approved transaction
    const status = input.method === "TRANSFER" || input.direction === "CREDIT" ? "COMPLETED" : "PENDING";
    const txn = await db.transaction.create({
      data: {
        userId: user.id,
        accountId: input.accountId,
        cardId: input.cardId ?? null,
        direction: input.direction,
        amountMinor: input.amountMinor,
        currency: input.currency,
        merchantName: input.merchantName,
        category: input.category,
        status,
        method: input.method,
        orderRef: input.orderRef || null,
        description: input.description ? sanitizeFreeText(input.description) : null,
        isDemo: true,
        postedAt: status === "COMPLETED" ? new Date() : null,
      },
      include: { card: { select: { label: true, last4: true } }, account: { select: { name: true } } },
    });

    // 3) 4-day follow-up for online purchases (the user's purchase-protection window)
    let followUp: RecordPurchaseResponse["followUp"] = null;
    if (input.method === "ONLINE" && input.direction === "DEBIT") {
      const fu = await db.followUp.create({
        data: {
          userId: user.id,
          transactionId: txn.id,
          dueAt: addDays(txn.createdAt, FOLLOW_UP_DAYS),
          status: "PENDING",
        },
      });
      followUp = {
        id: fu.id,
        transactionId: fu.transactionId,
        dueAt: fu.dueAt.toISOString(),
        status: fu.status as "PENDING",
        orderReceived: null,
        note: null,
        createdAt: fu.createdAt.toISOString(),
        resolvedAt: null,
      };
    }

    // 4) Intelligence rules -> explainable alerts
    const drafts = await runIntelligenceRules({
      userId: user.id,
      transactionId: txn.id,
      amountMinor: input.amountMinor,
      currency: input.currency,
      merchantName: input.merchantName,
      category: input.category,
      method: input.method,
      cardId: input.cardId ?? null,
    });
    const alertsCreated = await persistAlerts(user.id, drafts);

    await audit("TXN_RECORDED", `${(input.amountMinor / 100).toFixed(2)} ${input.currency} at ${input.merchantName} [${input.method}]`, user.id);

    const resp: RecordPurchaseResponse = {
      transaction: toTransactionDTO(txn as unknown as TxnRow),
      decision: "APPROVED",
      checks: decision.checks,
      followUp,
      alertsCreated,
    };
    return ok(resp, 201);
  } catch (err) {
    return mapError(err);
  }
}
