/**
 * NEXUS BANK — Elite 2027 automated test suite.
 *
 * Two layers:
 *   1. Unit tests against pure logic modules (money math, masking, validation, rate limiting).
 *   2. Integration tests against the RUNNING dev server on http://localhost:3000
 *      exercising the real HTTP API end-to-end (auth, cards, purchases, follow-ups,
 *      refunds, disputes, merchant rules, limits, invalid inputs, security).
 *
 * Run:  bun test tests/nexus-bank.test.ts
 *
 * NOTE: integration tests require the dev server (bun run dev) to be up.
 * Test users are created with unique emails and fully erased at the end.
 */
/// <reference types="bun-types" />
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

const BASE = "http://localhost:3000";

// ---------------------------------------------------------------------------
// 1. UNIT TESTS — pure logic
// ---------------------------------------------------------------------------

import { parseAmountToMinor, fmtMoney, addDays, startOfDay, startOfMonth } from "@/lib/money";
import { maskPan, maskEmail, sanitizeFreeText } from "@/lib/mask";
import { merchantKey, transactionCreateSchema, registerSchema, disputeCreateSchema, refundCreateSchema, refundResolveSchema } from "@/lib/validation";
import { rateLimit, resetRateLimits } from "@/lib/ratelimit";

describe("UNIT money math", () => {
  test("parseAmountToMinor parses valid decimal strings", () => {
    expect(parseAmountToMinor("10")).toBe(1000);
    expect(parseAmountToMinor("10.5")).toBe(1050);
    expect(parseAmountToMinor("£1,284.99".replace("£", ""))).toBe(128499);
    expect(parseAmountToMinor("0.01")).toBe(1);
  });
  test("parseAmountToMinor rejects invalid input", () => {
    expect(parseAmountToMinor("")).toBeNull();
    expect(parseAmountToMinor("-5")).toBeNull();
    expect(parseAmountToMinor("1.234")).toBeNull();
    expect(parseAmountToMinor("abc")).toBeNull();
    expect(parseAmountToMinor("12,3.4.5")).toBeNull();
  });
  test("fmtMoney formats minor units", () => {
    expect(fmtMoney(128499)).toBe("£1,284.99");
    expect(fmtMoney(-599)).toBe("-£5.99");
    expect(fmtMoney(1, "USD")).toBe("$0.01");
    expect(fmtMoney(0)).toBe("£0.00");
  });
  test("addDays is date-arithmetic exact", () => {
    const d = new Date("2027-03-28T12:00:00Z");
    expect(addDays(d, 4).getUTCDate()).toBe(1); // crosses month boundary
    expect(addDays(d, -30).getUTCMonth()).toBe(1);
  });
  test("startOfDay/startOfMonth normalise", () => {
    const d = new Date("2027-07-15T18:44:23");
    expect(startOfDay(d).getHours()).toBe(0);
    expect(startOfMonth(d).getDate()).toBe(1);
  });
});

describe("UNIT masking", () => {
  test("maskPan never reveals more than last4", () => {
    expect(maskPan("4921")).toBe("**** **** **** 4921");
    expect(maskPan("0000")).toBe("**** **** **** 0000");
  });
  test("maskEmail hides local part", () => {
    const masked = maskEmail("alexander.morgan@bank.example");
    expect(masked).toContain("@bank.example");
    expect(masked.startsWith("al")).toBe(true);
    expect(masked).not.toContain("alexander.morgan");
  });
  test("sanitizeFreeText strips long digit sequences (anti-credential smuggling)", () => {
    const out = sanitizeFreeText("note with 4539882100341187 inside");
    expect(out).not.toContain("4539882100341187");
    expect(out).toContain("[redacted number sequence]");
    expect(sanitizeFreeText("normal note 12 ok")).toBe("normal note 12 ok");
  });
});

describe("UNIT validation schemas", () => {
  test("merchantKey normalises merchant names", () => {
    expect(merchantKey("Nova Electronics Ltd.")).toBe("novaelectronicsltd");
    expect(merchantKey("  NOVA-electronics  ")).toBe("novaelectronics");
  });
  test("registerSchema enforces strong passwords", () => {
    expect(registerSchema.safeParse({ name: "Alex", email: "a@b.co", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "Alex", email: "a@b.co", password: "alllowercase123" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "Alex", email: "a@b.co", password: "NoDigitsHere" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "Alex", email: "a@b.co", password: "Str0ngPassphrase" }).success).toBe(true);
    expect(registerSchema.safeParse({ name: "Alex", email: "not-an-email", password: "Str0ngPassphrase" }).success).toBe(false);
  });
  test("transactionCreateSchema rejects zero/negative amounts and bad enums", () => {
    const base = { accountId: "x", merchantName: "Test Merchant", category: "Groceries", method: "ONLINE", amountMinor: 0 };
    expect(transactionCreateSchema.safeParse(base).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...base, amountMinor: -100 }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...base, amountMinor: 100, method: "TELEPORT" }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...base, amountMinor: 100, category: "Rockets" }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...base, amountMinor: 100 }).success).toBe(true);
  });
  test("disputeCreateSchema requires genuine-issue confirmation and long description", () => {
    const base = { reason: "NOT_RECEIVED", description: "The order never arrived and tracking shows no delivery attempt.", confirmGenuine: false };
    expect(disputeCreateSchema.safeParse(base).success).toBe(false); // checkbox not confirmed
    expect(disputeCreateSchema.safeParse({ ...base, description: "too short" }).success).toBe(false);
    expect(disputeCreateSchema.safeParse({ ...base, confirmGenuine: true }).success).toBe(true);
  });
  test("refund schemas constrain amounts", () => {
    expect(refundCreateSchema.safeParse({ amountMinor: 0 }).success).toBe(false);
    expect(refundCreateSchema.safeParse({ amountMinor: 500 }).success).toBe(true);
    expect(refundResolveSchema.safeParse({ refundId: "", status: "CONFIRMED" }).success).toBe(false);
    expect(refundResolveSchema.safeParse({ refundId: "r1", status: "MAGIC" }).success).toBe(false);
  });
});

describe("UNIT rate limiter", () => {
  test("sliding window blocks after limit and reports retryAfter", () => {
    resetRateLimits();
    const key = "unit-test-bucket";
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
  test("independent buckets", () => {
    resetRateLimits();
    expect(rateLimit("bucket-a", 1, 60_000).ok).toBe(true);
    expect(rateLimit("bucket-a", 1, 60_000).ok).toBe(false);
    expect(rateLimit("bucket-b", 1, 60_000).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. INTEGRATION TESTS — real HTTP API against the dev server
// ---------------------------------------------------------------------------

type Jar = { cookie?: string };

// Per-run client identity: the sandbox proxy passes X-Forwarded-For through, so
// each test run gets independent rate-limit buckets (mirrors distinct clients).
const RUN_IP = `203.0.114.${Math.floor(Math.random() * 250) + 2}`;

async function call(jar: Jar, method: string, path: string, body?: unknown, raw?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(raw || body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(jar.cookie ? { Cookie: jar.cookie } : {}),
      "X-Forwarded-For": RUN_IP,
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    signal: AbortSignal.timeout(45000),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/nb_session=[^;]+/);
    if (match) jar.cookie = match[0];
  }
  let json: Record<string, unknown> | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON responses (receipts) */
  }
  return { status: res.status, json };
}

function expectOk(res: { status: number; json: Record<string, unknown> | null }, status = 200) {
  if (res.status !== status) {
    throw new Error(`Expected HTTP ${status}, got ${res.status}: ${JSON.stringify(res.json)}`);
  }
  return res.json as { ok: boolean; data: Record<string, unknown> };
}

let jar: Jar = {};
const EMAIL = `nb-test-${Date.now()}@nexusbank.test`;
const PASSWORD = "Elite2027Pass!";
let userId = "";
let currentAccountId = "";
let cardDebit = "";
let cardVirtual = "";
let onlineTxnId = "";
let followUpDueFrom = "";

beforeAll(async () => {
  jar = {};
});

afterAll(async () => {
  // Full erasure of the test user (GDPR-style delete cascades everything).
  if (jar.cookie && userId) {
    await call(jar, "DELETE", "/api/bank/auth/data");
  }
});

describe("INTEGRATION authentication & security", () => {
  test("protected route rejects unauthenticated access", async () => {
    const res = await call({} as Jar, "GET", "/api/bank/auth/me");
    expect(res.status).toBe(401);
    expect(res.json?.ok).toBe(false);
  });

  test("registration rejects weak passwords", async () => {
    const res = await call({} as Jar, "POST", "/api/bank/auth/register", {
      name: "Test Analyst", email: EMAIL, password: "weak",
    });
    expect(res.status).toBe(400);
  });

  test("registration creates account, session cookie and demo seed", async () => {
    const res = await call(jar, "POST", "/api/bank/auth/register", {
      name: "Test Analyst", email: EMAIL, password: PASSWORD,
    });
    expect(res.status).toBe(201);
    expectOk(res, 201);
    userId = (res.json as { data: { user: { id: string } } }).data.user.id;
    expect(jar.cookie).toContain("nb_session=");
  });

  test("duplicate registration is rejected (409)", async () => {
    const res = await call({} as Jar, "POST", "/api/bank/auth/register", {
      name: "Test Analyst", email: EMAIL, password: PASSWORD,
    });
    expect(res.status).toBe(409);
  });

  test("wrong password login fails with uniform 401", async () => {
    const res = await call({} as Jar, "POST", "/api/bank/auth/login", { email: EMAIL, password: "WrongPassword9" });
    expect(res.status).toBe(401);
    expect(res.json?.error).toBe("Invalid email or password.");
  });

  test("unknown email login fails identically (no enumeration)", async () => {
    const res = await call({} as Jar, "POST", "/api/bank/auth/login", { email: "ghost@nowhere.test", password: "Whatever123" });
    expect(res.status).toBe(401);
    expect(res.json?.error).toBe("Invalid email or password.");
  });

  test("session works: /me returns user + seeded accounts", async () => {
    const res = await call(jar, "GET", "/api/bank/auth/me");
    expectOk(res);
    const data = (res.json as { data: { user: { email: string }; accounts: { id: string; type: string; name: string }[] } }).data;
    expect(data.user.email).toBe(EMAIL);
    expect(data.accounts.length).toBeGreaterThanOrEqual(2);
    const current = data.accounts.find((a) => a.type === "CURRENT");
    expect(current).toBeDefined();
    currentAccountId = current!.id;
  });
  test("malformed JSON body returns 400 (not 500)", async () => {
    const res = await call(jar, "POST", "/api/bank/auth/login", undefined, "{not-json");
    expect(res.status).toBe(400);
  });
});

describe("INTEGRATION card management", () => {
  test("seeded demo cards exist with masked data only", async () => {
    const res = await call(jar, "GET", "/api/bank/cards");
    expectOk(res);
    const data = (res.json as { data: { cards: { id: string; label: string; last4: string; status: string; kind: string }[] } }).data;
    expect(data.cards.length).toBe(3);
    for (const c of data.cards) {
      expect(c.last4).toMatch(/^\d{4}$/);
      expect(Object.keys(c)).not.toContain("pan");
      expect(Object.keys(c)).not.toContain("cvv");
    }
    cardDebit = data.cards.find((c) => c.kind === "DEBIT")!.id;
    cardVirtual = data.cards.find((c) => c.kind === "VIRTUAL")!.id;
  });

  test("freeze blocks new purchases (policy DECLINED)", async () => {
    const f = await call(jar, "POST", `/api/bank/cards/${cardVirtual}/freeze`, { frozen: true });
    expectOk(f);
    expect((f.json as { data: { card: { status: string } } }).data.card.status).toBe("FROZEN");

    const purchase = await call(jar, "POST", "/api/bank/transactions", {
      accountId: currentAccountId, cardId: cardVirtual, direction: "DEBIT",
      merchantName: "Freeze Test Store", category: "Electronics", method: "ONLINE",
      amountMinor: 2500, currency: "GBP",
    });
    expectOk(purchase);
    const data = (purchase.json as { data: { decision: string; declinedBy: string; transaction: { status: string } } }).data;
    expect(data.decision).toBe("DECLINED");
    expect(data.declinedBy).toBe("CARD_FROZEN");
    expect(data.transaction.status).toBe("DECLINED");
  });

  test("unfreeze restores purchasing", async () => {
    const f = await call(jar, "POST", `/api/bank/cards/${cardVirtual}/freeze`, { frozen: false });
    expectOk(f);
    expect((f.json as { data: { card: { status: string } } }).data.card.status).toBe("ACTIVE");
  });

  test("limit guardrail: per-tx limit cannot exceed daily limit", async () => {
    const res = await call(jar, "PATCH", `/api/bank/cards/${cardVirtual}`, { perTxLimitMinor: 200000, dailyLimitMinor: 50000 });
    expect(res.status).toBe(400);
  });

  test("per-transaction limit declines oversized purchases", async () => {
    const before = await call(jar, "GET", "/api/bank/cards");
    const card = (before.json as { data: { cards: { id: string; perTxLimitMinor: number }[] } }).data.cards.find((c) => c.id === cardVirtual)!;
    const overLimit = card.perTxLimitMinor + 100;
    const purchase = await call(jar, "POST", "/api/bank/transactions", {
      accountId: currentAccountId, cardId: cardVirtual, direction: "DEBIT",
      merchantName: "Big Ticket Store", category: "Electronics", method: "ONLINE",
      amountMinor: overLimit, currency: "GBP",
    });
    expectOk(purchase);
    const data = (purchase.json as { data: { decision: string; declinedBy: string } }).data;
    expect(data.decision).toBe("DECLINED");
    expect(data.declinedBy).toBe("PER_TX_LIMIT");
  });

  test("online permission switch declines online purchases when disabled", async () => {
    const disabled = await call(jar, "PATCH", `/api/bank/cards/${cardVirtual}`, { onlineAllowed: false });
    expect(disabled.status).toBe(200);
    try {
      const purchase = await call(jar, "POST", "/api/bank/transactions", {
        accountId: currentAccountId, cardId: cardVirtual, direction: "DEBIT",
        merchantName: "Offline Test Store", category: "Electronics", method: "ONLINE",
        amountMinor: 1200, currency: "GBP",
      });
      const data = (purchase.json as { data: { decision: string; declinedBy: string } }).data;
      expect(data.decision).toBe("DECLINED");
      expect(data.declinedBy).toBe("ONLINE_DISABLED");
    } finally {
      const enabled = await call(jar, "PATCH", `/api/bank/cards/${cardVirtual}`, { onlineAllowed: true });
      expect(enabled.status).toBe(200);
    }
  });

  test("daily limit enforcement: purchases beyond daily allowance decline", async () => {
    // £20.00 per-tx & daily limits. First £16 purchase passes; second £5 purchase
    // would push daySum to £21 > £20 daily cap → declined by the policy engine.
    const patched = await call(jar, "PATCH", `/api/bank/cards/${cardVirtual}`, { perTxLimitMinor: 2000, dailyLimitMinor: 2000, monthlyLimitMinor: 100000 });
    expect(patched.status).toBe(200);
    try {
      const first = await call(jar, "POST", "/api/bank/transactions", {
        accountId: currentAccountId, cardId: cardVirtual, direction: "DEBIT",
        merchantName: "Daily Limit Store", category: "Groceries", method: "ONLINE",
        amountMinor: 1600, currency: "GBP",
      });
      expect((first.json as { data: { decision: string } }).data.decision).toBe("APPROVED");

      const purchase = await call(jar, "POST", "/api/bank/transactions", {
        accountId: currentAccountId, cardId: cardVirtual, direction: "DEBIT",
        merchantName: "Daily Limit Store", category: "Groceries", method: "ONLINE",
        amountMinor: 500, currency: "GBP",
      });
      const data = (purchase.json as { data: { decision: string; declinedBy: string } }).data;
      expect(data.decision).toBe("DECLINED");
      expect(data.declinedBy).toBe("DAILY_LIMIT");
    } finally {
      const restored = await call(jar, "PATCH", `/api/bank/cards/${cardVirtual}`, { perTxLimitMinor: 30000, dailyLimitMinor: 50000, monthlyLimitMinor: 150000 });
      expect(restored.status).toBe(200);
    }
  });

  test("virtual demo card can be created; kind stays VIRTUAL", async () => {
    const res = await call(jar, "POST", "/api/bank/cards", {
      accountId: currentAccountId, label: "Test Virtual Card", kind: "VIRTUAL", network: "MASTERCARD",
      holderName: "TEST ANALYST", perTxLimitMinor: 10000, dailyLimitMinor: 20000,
      monthlyLimitMinor: 100000, onlineAllowed: true, contactlessAllowed: false,
      internationalAllowed: true, atmAllowed: false,
    });
    expect(res.status).toBe(201);
    const data = (res.json as { data: { card: { kind: string; last4: string; label: string } } }).data;
    expect(data.card.kind).toBe("VIRTUAL");
    expect(data.card.last4).toMatch(/^\d{4}$/);
  });
});

describe("INTEGRATION online purchase recording & 4-day follow-up", () => {
  test("approved ONLINE purchase creates PENDING transaction + follow-up due exactly +4 days", async () => {
    const purchase = await call(jar, "POST", "/api/bank/transactions", {
      accountId: currentAccountId, cardId: cardVirtual, direction: "DEBIT",
      merchantName: "NovaElectronics", category: "Electronics", method: "ONLINE",
      amountMinor: 12999, currency: "GBP", orderRef: "NE-TEST-001",
    });
    expectOk(purchase, 201);
    const data = (purchase.json as {
      data: { decision: string; transaction: { id: string; status: string; orderRef: string }; followUp: { id: string; dueAt: string } | null; alertsCreated: number };
    }).data;
    expect(data.decision).toBe("APPROVED");
    expect(data.transaction.status).toBe("PENDING");
    expect(data.transaction.orderRef).toBe("NE-TEST-001");
    expect(data.followUp).not.toBeNull();

    const purchaseDate = new Date();
    const due = new Date(data.followUp!.dueAt);
    const diffDays = Math.round((due.getTime() - purchaseDate.getTime()) / 86_400_000);
    expect(diffDays).toBe(4);
    followUpDueFrom = data.followUp!.id;
    onlineTxnId = data.transaction.id;
  });

  test("follow-up appears in the follow-up centre as upcoming (not yet due)", async () => {
    const res = await call(jar, "GET", "/api/bank/followups");
    expectOk(res);
    const data = (res.json as { data: { upcoming: { id: string }[]; due: unknown[] } }).data;
    expect(data.upcoming.some((f) => f.id === followUpDueFrom)).toBe(true);
    expect(data.due.some((f) => (f as { id: string }).id === followUpDueFrom)).toBe(false);
  });

  test("purchase confirmation flow: pending -> completed (user-declared)", async () => {
    const res = await call(jar, "POST", `/api/bank/transactions/${onlineTxnId}/status`, { status: "COMPLETED" });
    expectOk(res);
    expect((res.json as { data: { transaction: { status: string; postedAt: string | null } } }).data.transaction.status).toBe("COMPLETED");
    expect((res.json as { data: { transaction: { postedAt: string | null } } }).data.transaction.postedAt).not.toBeNull();
  });

  test("follow-up resolve (not received) creates guidance + WARN alert, never auto-disputes", async () => {
    const res = await call(jar, "POST", `/api/bank/followups/${followUpDueFrom}/resolve`, { orderReceived: false, note: "Tracking shows nothing." });
    expectOk(res);
    const data = (res.json as { data: { followUp: { status: string; orderReceived: boolean }; nextStep: { guidance: string } | null } }).data;
    expect(data.followUp.status).toBe("RESOLVED");
    expect(data.followUp.orderReceived).toBe(false);
    expect(data.nextStep?.guidance).toContain("merchant support");

    // Alert was raised
    const alerts = await call(jar, "GET", "/api/bank/alerts?unread=1");
    const list = (alerts.json as { data: { alerts: { type: string; explanation: string }[] } }).data.alerts;
    expect(list.some((a) => a.type === "FOLLOW_UP_DUE" && a.explanation.includes("never automatically disputed") === false && a.explanation.length > 40)).toBe(true);

    // No dispute was auto-created
    const txns = await call(jar, "GET", `/api/bank/transactions/${onlineTxnId}`);
    const detail = (txns.json as { data: { transaction: { disputes: unknown[]; status: string } } }).data.transaction;
    expect(detail.disputes.length).toBe(0);
    expect(detail.status).not.toBe("DISPUTED");
  });

  test("already-resolved follow-up rejects re-resolution", async () => {
    const res = await call(jar, "POST", `/api/bank/followups/${followUpDueFrom}/resolve`, { orderReceived: true });
    expect(res.status).toBe(409);
  });
});

describe("INTEGRATION merchant restrictions", () => {
  test("blocked merchant declines future payments", async () => {
    await call(jar, "POST", "/api/bank/merchants", { displayName: "RiskyShop", blocked: true, note: "test block" });
    const purchase = await call(jar, "POST", "/api/bank/transactions", {
      accountId: currentAccountId, cardId: cardVirtual, direction: "DEBIT",
      merchantName: "RiskyShop", category: "Electronics", method: "ONLINE",
      amountMinor: 900, currency: "GBP",
    });
    const data = (purchase.json as { data: { decision: string; declinedBy: string; reason: string } }).data;
    expect(data.decision).toBe("DECLINED");
    expect(data.declinedBy).toBe("MERCHANT_BLOCKED");
    expect(data.reason).toContain("blocked");
  });

  test("merchant monthly cap enforced", async () => {
    await call(jar, "POST", "/api/bank/merchants", { displayName: "CappedShop", blocked: false, monthlyLimitMinor: 1000 });
    const purchase = await call(jar, "POST", "/api/bank/transactions", {
      accountId: currentAccountId, cardId: cardVirtual, direction: "DEBIT",
      merchantName: "CappedShop", category: "Electronics", method: "ONLINE",
      amountMinor: 1500, currency: "GBP",
    });
    const data = (purchase.json as { data: { decision: string; declinedBy: string } }).data;
    expect(data.decision).toBe("DECLINED");
    expect(data.declinedBy).toBe("MERCHANT_MONTHLY_LIMIT");
  });

  test("merchant rules list & delete", async () => {
    const list = await call(jar, "GET", "/api/bank/merchants");
    const rules = (list.json as { data: { rules: { id: string; displayName: string }[] } }).data.rules;
    const risky = rules.find((r) => r.displayName === "RiskyShop");
    expect(risky).toBeDefined();
    const del = await call(jar, "DELETE", `/api/bank/merchants?id=${risky!.id}`);
    expectOk(del);
    expect((del.json as { data: { removed: string } }).data.removed).toBe(risky!.id);
  });
});

describe("INTEGRATION transaction intelligence", () => {
  test("duplicate payment within 120s raises explainable DUPLICATE alert", async () => {
    const body = {
      accountId: currentAccountId, cardId: cardDebit, direction: "DEBIT",
      merchantName: "DupliMart", category: "Groceries", method: "POS",
      amountMinor: 765, currency: "GBP",
    };
    const first = await call(jar, "POST", "/api/bank/transactions", body);
    expect((first.json as { data: { decision: string } }).data.decision).toBe("APPROVED");
    const second = await call(jar, "POST", "/api/bank/transactions", body);
    expect((second.json as { data: { decision: string } }).data.decision).toBe("APPROVED");
    expect((second.json as { data: { alertsCreated: number } }).data.alertsCreated).toBeGreaterThanOrEqual(1);

    const alerts = await call(jar, "GET", "/api/bank/alerts");
    const list = (alerts.json as { data: { alerts: { type: string; explanation: string }[] } }).data.alerts;
    const dup = list.find((a) => a.type === "DUPLICATE_RECENT");
    expect(dup).toBeDefined();
    expect(dup!.explanation).toContain("120-second");
  });

  test("budget breach raises explainable BUDGET_LIMIT alert", async () => {
    await call(jar, "POST", "/api/bank/budgets", { category: "Dining", monthlyLimitMinor: 500 });
    const purchase = await call(jar, "POST", "/api/bank/transactions", {
      accountId: currentAccountId, cardId: cardVirtual, direction: "DEBIT",
      merchantName: "OverBudget Cafe", category: "Dining", method: "ONLINE",
      amountMinor: 800, currency: "GBP",
    });
    expect((purchase.json as { data: { transaction: { id: string } } }).data.transaction.id).toBeTruthy();
    const alerts = await call(jar, "GET", "/api/bank/alerts");
    const list = (alerts.json as { data: { alerts: { type: string; explanation: string }[] } }).data.alerts;
    const breach = list.find((a) => a.type === "BUDGET_LIMIT");
    expect(breach).toBeDefined();
    expect(breach!.explanation).toContain("over your");
    const budgetsList = await call(jar, "GET", "/api/bank/budgets");
    const dining = (budgetsList.json as { data: { budgets: { id: string; category: string }[] } }).data.budgets.find((b) => b.category === "Dining");
    expect(dining).toBeDefined();
    await call(jar, "DELETE", `/api/bank/budgets?id=${dining!.id}`);
  });

  test("insights returns live aggregations", async () => {
    const res = await call(jar, "GET", "/api/bank/insights");
    expectOk(res);
    const data = (res.json as { data: { todayMinor: number; byCategory: unknown[]; monthlyTrend: unknown[]; counts: { completed: number } } }).data;
    expect(data.monthlyTrend.length).toBe(6);
    expect(data.byCategory.length).toBeGreaterThan(0);
    expect(data.counts.completed).toBeGreaterThan(0);
  });
});

describe("INTEGRATION transaction search & filtering", () => {
  test("filter by status=PENDING returns only pending", async () => {
    const res = await call(jar, "GET", "/api/bank/transactions?status=PENDING");
    const data = (res.json as { data: { transactions: { status: string }[] } }).data;
    expect(data.transactions.length).toBeGreaterThan(0);
    for (const t of data.transactions) expect(t.status).toBe("PENDING");
  });

  test("filter by method=ONLINE returns only online", async () => {
    const res = await call(jar, "GET", "/api/bank/transactions?method=ONLINE");
    const data = (res.json as { data: { transactions: { method: string }[] } }).data;
    expect(data.transactions.length).toBeGreaterThan(0);
    for (const t of data.transactions) expect(t.method).toBe("ONLINE");
  });

  test("query search matches merchant names", async () => {
    const res = await call(jar, "GET", "/api/bank/transactions?q=NovaElectronics");
    const data = (res.json as { data: { transactions: { merchantName: string }[] } }).data;
    expect(data.transactions.length).toBeGreaterThan(0);
    for (const t of data.transactions) expect(t.merchantName.toLowerCase()).toContain("nova");
  });

  test("pagination bounds and metadata", async () => {
    const res = await call(jar, "GET", "/api/bank/transactions?page=1&pageSize=5");
    const data = (res.json as { data: { transactions: unknown[]; page: number; pages: number; total: number } }).data;
    expect(data.transactions.length).toBeLessThanOrEqual(5);
    expect(data.page).toBe(1);
    expect(data.pages).toBe(Math.ceil(data.total / 5));
  });

  test("detail endpoint includes timeline, refunds, disputes, followUps, alerts", async () => {
    const res = await call(jar, "GET", `/api/bank/transactions/${onlineTxnId}`);
    const txn = (res.json as { data: { transaction: { timeline: unknown[]; refunds: unknown[]; disputes: unknown[]; followUps: unknown[]; alerts: unknown[] } } }).data.transaction;
    expect(txn.timeline.length).toBeGreaterThan(0);
    expect(txn.followUps.length).toBe(1);
    expect(Array.isArray(txn.refunds)).toBe(true);
    expect(Array.isArray(txn.disputes)).toBe(true);
    expect(Array.isArray(txn.alerts)).toBe(true);
  });

  test("other users' transactions are inaccessible (404)", async () => {
    const res = await call(jar, "GET", "/api/bank/transactions/txn-that-does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("INTEGRATION refund tracking", () => {
  let refundId = "";

  test("refund can be requested on a completed transaction (REQUESTED state)", async () => {
    const res = await call(jar, "POST", `/api/bank/transactions/${onlineTxnId}/refund`, { amountMinor: 5000, note: "Partial return" });
    expect(res.status).toBe(201);
    const data = (res.json as { data: { refund: { id: string; status: string } } }).data;
    expect(data.refund.status).toBe("REQUESTED");
    refundId = data.refund.id;
  });

  test("second open refund is rejected while one is REQUESTED", async () => {
    const res = await call(jar, "POST", `/api/bank/transactions/${onlineTxnId}/refund`, { amountMinor: 100 });
    expect(res.status).toBe(409);
  });

  test("over-refund beyond refundable balance is rejected", async () => {
    // transaction is £129.99, £50 already requested → request £500 total fails
    const res = await call(jar, "POST", `/api/bank/transactions/zz/refund`, { amountMinor: 50000 });
    expect(res.status).toBe(404);
  });

  test("resolving as CONFIRMED updates refunded totals and transaction status", async () => {
    const res = await call(jar, "PATCH", `/api/bank/transactions/${onlineTxnId}/refund`, {
      refundId, status: "CONFIRMED", providerRef: "RF-TEST-1", note: "Merchant confirmed",
    });
    expectOk(res);
    expect((res.json as { data: { refund: { status: string } } }).data.refund.status).toBe("CONFIRMED");

    const detail = await call(jar, "GET", `/api/bank/transactions/${onlineTxnId}`);
    const txn = (detail.json as { data: { transaction: { status: string; refundedMinor: number } } }).data.transaction;
    expect(txn.refundedMinor).toBe(5000);
    expect(txn.status).toBe("PARTIALLY_REFUNDED");
  });

  test("already-resolved refund cannot be resolved again", async () => {
    const res = await call(jar, "PATCH", `/api/bank/transactions/${onlineTxnId}/refund`, { refundId, status: "DECLINED" });
    expect(res.status).toBe(409);
  });
});

describe("INTEGRATION dispute workflow", () => {
  let disputeTxn = "";
  let disputeId = "";

  test("dispute requires genuine-issue confirmation and 20+ char description", async () => {
    // find a completed debit to dispute
    const list = await call(jar, "GET", "/api/bank/transactions?status=COMPLETED&method=ONLINE");
    disputeTxn = (list.json as { data: { transactions: { id: string }[] } }).data.transactions[0].id;

    const bad1 = await call(jar, "POST", `/api/bank/transactions/${disputeTxn}/dispute`, {
      reason: "NOT_RECEIVED", description: "Short desc", confirmGenuine: true,
    });
    expect(bad1.status).toBe(400);

    const bad2 = await call(jar, "POST", `/api/bank/transactions/${disputeTxn}/dispute`, {
      reason: "NOT_RECEIVED", description: "Valid enough description for the dispute body.", confirmGenuine: false,
    });
    expect(bad2.status).toBe(400);
  });

  test("genuine dispute is accepted; transaction becomes DISPUTED", async () => {
    const res = await call(jar, "POST", `/api/bank/transactions/${disputeTxn}/dispute`, {
      reason: "NOT_RECEIVED",
      description: "Integration test: the order was never delivered and merchant tracking shows no attempt.",
      confirmGenuine: true,
    });
    expect(res.status).toBe(201);
    const data = (res.json as { data: { dispute: { id: string; status: string; timeline: { event: string }[] } } }).data;
    expect(data.dispute.status).toBe("SUBMITTED");
    expect(data.dispute.timeline[0].event).toBe("DISPUTE_SUBMITTED");
    disputeId = data.dispute.id;

    const detail = await call(jar, "GET", `/api/bank/transactions/${disputeTxn}`);
    expect((detail.json as { data: { transaction: { status: string } } }).data.transaction.status).toBe("DISPUTED");
  });

  test("second open dispute on the same transaction is rejected", async () => {
    const res = await call(jar, "POST", `/api/bank/transactions/${disputeTxn}/dispute`, {
      reason: "OTHER", description: "Attempting to open a duplicate dispute for the same transaction.", confirmGenuine: true,
    });
    expect(res.status).toBe(409);
  });

  test("dispute lifecycle advances SUBMITTED -> UNDER_REVIEW -> PROVISIONAL_CREDIT", async () => {
    const a1 = await call(jar, "POST", `/api/bank/disputes/${disputeId}/advance`, {});
    const s1 = (a1.json as { data: { dispute: { status: string; timeline: unknown[] } } }).data.dispute;
    expect(s1.status).toBe("UNDER_REVIEW");
    expect(s1.timeline.length).toBe(2);

    const a2 = await call(jar, "POST", `/api/bank/disputes/${disputeId}/advance`, {});
    const s2 = (a2.json as { data: { dispute: { status: string } } }).data.dispute;
    expect(s2.status).toBe("PROVISIONAL_CREDIT");
  });

  test("withdrawal is allowed before final resolution", async () => {
    const res = await call(jar, "POST", `/api/bank/disputes/${disputeId}/withdraw`, {});
    expectOk(res);
    const status = (res.json as { data: { dispute: { status: string; timeline: { event: string }[] } } }).data.dispute;
    expect(status.status).toBe("WITHDRAWN");
    expect(status.timeline[status.timeline.length - 1].event).toBe("WITHDRAWN");

    // transaction restored
    const detail = await call(jar, "GET", `/api/bank/transactions/${disputeTxn}`);
    expect((detail.json as { data: { transaction: { status: string } } }).data.transaction.status).toBe("COMPLETED");
  });

  test("resolved/withdrawn dispute cannot advance further", async () => {
    const res = await call(jar, "POST", `/api/bank/disputes/${disputeId}/advance`, {});
    expect(res.status).toBe(409);
  });

  test("full dispute to RESOLVED_WON refunds the transaction", async () => {
    const open = await call(jar, "POST", `/api/bank/transactions/${disputeTxn}/dispute`, {
      reason: "NOT_AS_DESCRIBED",
      description: "Integration test: second lifecycle run to verify resolution refunds the transaction.",
      confirmGenuine: true,
    });
    const id = (open.json as { data: { dispute: { id: string } } }).data.dispute.id;
    await call(jar, "POST", `/api/bank/disputes/${id}/advance`, {});
    await call(jar, "POST", `/api/bank/disputes/${id}/advance`, {});
    const fin = await call(jar, "POST", `/api/bank/disputes/${id}/advance`, {});
    const status = (fin.json as { data: { dispute: { status: string } } }).data.dispute;
    expect(status.status).toBe("RESOLVED_WON");
    const detail = await call(jar, "GET", `/api/bank/transactions/${disputeTxn}`);
    const txn = (detail.json as { data: { transaction: { status: string; refundedMinor: number } } }).data.transaction;
    expect(txn.status).toBe("REFUNDED");
    expect(txn.refundedMinor).toBeGreaterThan(0);
  });
});

describe("INTEGRATION budgets, alerts, receipts, security", () => {
  test("budget upsert & list", async () => {
    await call(jar, "POST", "/api/bank/budgets", { category: "Transport", monthlyLimitMinor: 10000 });
    const list = await call(jar, "GET", "/api/bank/budgets");
    const budgets = (list.json as { data: { budgets: { category: string; monthlyLimitMinor: number }[] } }).data.budgets;
    expect(budgets.some((b) => b.category === "Transport" && b.monthlyLimitMinor === 10000)).toBe(true);
  });

  test("alerts mark-read works", async () => {
    const list = await call(jar, "GET", "/api/bank/alerts");
    const alerts = (list.json as { data: { alerts: { id: string; read: boolean }[] } }).data.alerts;
    expect(alerts.length).toBeGreaterThan(0);
    const target = alerts.find((a) => !a.read);
    if (target) {
      await call(jar, "POST", "/api/bank/alerts/read", { ids: [target.id] });
      const after = await call(jar, "GET", "/api/bank/alerts");
      const refreshed = (after.json as { data: { alerts: { id: string; read: boolean }[] } }).data.alerts;
      expect(refreshed.find((a) => a.id === target.id)!.read).toBe(true);
    }
  });

  test("receipts download as HTML and JSON, always demo-labelled", async () => {
    const html = await fetch(`${BASE}/api/bank/receipts/${onlineTxnId}?format=html`, { headers: { Cookie: jar.cookie! } });
    expect(html.status).toBe(200);
    const htmlText = await html.text();
    expect(htmlText).toContain("DEMO");
    expect(htmlText).toContain("NovaElectronics");
    expect(htmlText).not.toMatch(/\d{13,19}/); // no full card numbers ever

    const json = await fetch(`${BASE}/api/bank/receipts/${onlineTxnId}?format=json`, { headers: { Cookie: jar.cookie! } });
    const body = (await json.json()) as { receiptNo: string; environment: string };
    expect(body.receiptNo).toContain("NB-RCPT-");
    expect(body.environment).toContain("DEMO");
  });

  test("security centre exposes sessions, audit trail, protections", async () => {
    const res = await call(jar, "GET", "/api/bank/security");
    expectOk(res);
    const data = (res.json as { data: { sessions: unknown[]; auditEvents: unknown[]; protections: { name: string; status: string }[] } }).data;
    expect(data.sessions.length).toBe(1);
    expect(data.auditEvents.length).toBeGreaterThan(0);
    expect(data.protections.some((p) => p.name === "Password hashing" && p.status === "ENABLED")).toBe(true);
  });

  test("password change rejects wrong current password", async () => {
    const res = await call(jar, "POST", "/api/bank/auth/password", { currentPassword: "WrongOld1Aa", newPassword: "NewElite2027Pass" });
    expect(res.status).toBe(401);
  });

  test("password change succeeds and keeps current session", async () => {
    const res = await call(jar, "POST", "/api/bank/auth/password", { currentPassword: PASSWORD, newPassword: "NewElite2027Pass" });
    expectOk(res);
    const me = await call(jar, "GET", "/api/bank/auth/me");
    expect(me.status).toBe(200);
  });

  test("invalid transaction inputs all fail with 400", async () => {
    const cases: unknown[] = [
      { accountId: currentAccountId, merchantName: "X", category: "Groceries", method: "ONLINE", amountMinor: 100 }, // merchant too short
      { accountId: currentAccountId, merchantName: "Valid Merchant", category: "Groceries", method: "ONLINE", amountMinor: 0 },
      { accountId: currentAccountId, merchantName: "Valid Merchant", category: "Groceries", method: "ONLINE", amountMinor: 50_000_01 },
      { accountId: "", merchantName: "Valid Merchant", category: "Groceries", method: "ONLINE", amountMinor: 100 },
      { merchantName: "Valid Merchant", category: "Groceries", method: "ONLINE", amountMinor: 100 },
    ];
    for (const body of cases) {
      const res = await call(jar, "POST", "/api/bank/transactions", body);
      expect(res.status).toBe(400);
    }
  });

  test("unknown account id returns 404", async () => {
    const res = await call(jar, "POST", "/api/bank/transactions", {
      accountId: "nonexistent", merchantName: "Valid Merchant", category: "Groceries", method: "ONLINE", amountMinor: 100,
    });
    expect(res.status).toBe(404);
  });

  test("rate limiting blocks brute-force login attempts (429)", async () => {
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await call({} as Jar, "POST", "/api/bank/auth/login", { email: `bruteforce-${i}@test.io`, password: "BruteForce1Aa" });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });
});
