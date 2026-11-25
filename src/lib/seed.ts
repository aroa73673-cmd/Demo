/**
 * NEXUS BANK — demo environment seeding.
 *
 * Everything created here is demo data and is flagged `isDemo: true` in the
 * database and "DEMO" in the UI. Merchant names are fictional. No real card
 * numbers, credentials or payment authorisations are created or implied.
 *
 * Historical transactions are inserted directly (their alerts would otherwise
 * reference today's windows); the two most recent ONLINE purchases get genuine
 * 4-day follow-up records, one already due, mirroring what the live pipeline
 * would have produced.
 */
import { db } from "@/lib/db";
import { FOLLOW_UP_DAYS } from "@/lib/types";

function daysAgo(n: number, hour = 12, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export async function seedDemoData(userId: string, holderName: string): Promise<void> {
  const existing = await db.account.count({ where: { userId } });
  if (existing > 0) return; // already seeded

  await db.$transaction(async (tx) => {
    // ---------- Accounts ----------
    const current = await tx.account.create({
      data: {
        userId,
        name: "Everyday Current Account",
        type: "CURRENT",
        currency: "GBP",
        balanceMinor: 428650,
        isDemo: true,
        createdAt: daysAgo(90),
      },
    });
    await tx.account.create({
      data: {
        userId,
        name: "Reserve Savings",
        type: "SAVINGS",
        currency: "GBP",
        balanceMinor: 1215000,
        isDemo: true,
        createdAt: daysAgo(90),
      },
    });

    // ---------- Cards ----------
    const visaDebit = await tx.card.create({
      data: {
        userId,
        accountId: current.id,
        label: "Everyday Visa Debit",
        kind: "DEBIT",
        network: "VISA",
        holderName: holderName.toUpperCase(),
        last4: "4921",
        expiryMonth: 9,
        expiryYear: 2029,
        status: "ACTIVE",
        perTxLimitMinor: 50000,
        dailyLimitMinor: 100000,
        monthlyLimitMinor: 500000,
        onlineAllowed: true,
        contactlessAllowed: true,
        internationalAllowed: false,
        atmAllowed: true,
        isDemo: true,
        createdAt: daysAgo(88),
      },
    });
    const mcCredit = await tx.card.create({
      data: {
        userId,
        accountId: current.id,
        label: "Platinum Mastercard",
        kind: "CREDIT",
        network: "MASTERCARD",
        holderName: holderName.toUpperCase(),
        last4: "8804",
        expiryMonth: 3,
        expiryYear: 2028,
        status: "ACTIVE",
        perTxLimitMinor: 100000,
        dailyLimitMinor: 200000,
        monthlyLimitMinor: 800000,
        onlineAllowed: true,
        contactlessAllowed: true,
        internationalAllowed: true,
        atmAllowed: false,
        isDemo: true,
        createdAt: daysAgo(80),
      },
    });
    const virtual = await tx.card.create({
      data: {
        userId,
        accountId: current.id,
        label: "Virtual — Online Shopping",
        kind: "VIRTUAL",
        network: "VISA",
        holderName: holderName.toUpperCase(),
        last4: "1109",
        expiryMonth: 12,
        expiryYear: 2027,
        status: "ACTIVE",
        perTxLimitMinor: 30000,
        dailyLimitMinor: 50000,
        monthlyLimitMinor: 150000,
        onlineAllowed: true,
        contactlessAllowed: false,
        internationalAllowed: true,
        atmAllowed: false,
        isDemo: true,
        createdAt: daysAgo(45),
      },
    });

    // ---------- Merchant rules (examples, user-editable) ----------
    await tx.merchantRule.createMany({
      data: [
        {
          userId,
          name: "streamverse",
          displayName: "StreamVerse",
          blocked: false,
          monthlyLimitMinor: 1500,
          note: "Example merchant cap created during demo setup.",
        },
        {
          userId,
          name: "playzonebets",
          displayName: "PlayZone Bets",
          blocked: true,
          note: "Example blocked merchant created during demo setup.",
        },
      ],
    });

    // ---------- Budgets ----------
    await tx.budget.createMany({
      data: [
        { userId, category: "Groceries", monthlyLimitMinor: 60000 },
        { userId, category: "Dining", monthlyLimitMinor: 20000 },
        { userId, category: "Transport", monthlyLimitMinor: 15000 },
        { userId, category: "Electronics", monthlyLimitMinor: 80000 },
        { userId, category: "Subscriptions", monthlyLimitMinor: 5000 },
      ],
    });

    // ---------- Historical demo transactions (60-day window) ----------
    type Seed = {
      cardId?: string | null;
      direction?: "DEBIT" | "CREDIT";
      amountMinor: number;
      merchantName: string;
      merchantCategory?: string;
      category: string;
      status?: string;
      method: string;
      orderRef?: string;
      description?: string;
      at: Date;
      posted?: boolean;
    };
    const seeds: Seed[] = [
      // Month -2
      { cardId: null, direction: "CREDIT", amountMinor: 285000, merchantName: "Employer Payroll", category: "Other", method: "TRANSFER", description: "Salary credit (demo)", at: daysAgo(61, 8) },
      { cardId: visaDebit.id, amountMinor: 3420, merchantName: "Aurora Market", merchantCategory: "5411 - Supermarket", category: "Groceries", method: "POS", at: daysAgo(60, 18), posted: true },
      { cardId: visaDebit.id, amountMinor: 1299, merchantName: "StreamVerse", merchantCategory: "5815 - Media", category: "Subscriptions", method: "SUBSCRIPTION", description: "Monthly plan", at: daysAgo(58, 7), posted: true },
      { cardId: visaDebit.id, amountMinor: 450, merchantName: "CityCafe", merchantCategory: "5814 - Restaurant", category: "Dining", method: "POS", at: daysAgo(56, 9), posted: true },
      { cardId: visaDebit.id, amountMinor: 210, merchantName: "Metro Transit", merchantCategory: "4111 - Transport", category: "Transport", method: "POS", at: daysAgo(55, 8, 30), posted: true },
      { cardId: virtual.id, amountMinor: 999, merchantName: "CloudHost Pro", merchantCategory: "7372 - IT Services", category: "Digital Services", method: "SUBSCRIPTION", description: "Cloud hosting", at: daysAgo(52, 10), posted: true },
      { cardId: mcCredit.id, amountMinor: 7999, merchantName: "UrbanWear", merchantCategory: "5651 - Apparel", category: "Clothing", method: "ONLINE", orderRef: "UW-88123", at: daysAgo(49, 20), posted: true },
      { cardId: visaDebit.id, amountMinor: 3890, merchantName: "Aurora Market", merchantCategory: "5411 - Supermarket", category: "Groceries", method: "POS", at: daysAgo(46, 17), posted: true },
      // Month -1
      { cardId: null, direction: "CREDIT", amountMinor: 285000, merchantName: "Employer Payroll", category: "Other", method: "TRANSFER", description: "Salary credit (demo)", at: daysAgo(31, 8) },
      { cardId: visaDebit.id, amountMinor: 4120, merchantName: "Aurora Market", merchantCategory: "5411 - Supermarket", category: "Groceries", method: "POS", at: daysAgo(30, 18), posted: true },
      { cardId: visaDebit.id, amountMinor: 1299, merchantName: "StreamVerse", merchantCategory: "5815 - Media", category: "Subscriptions", method: "SUBSCRIPTION", description: "Monthly plan", at: daysAgo(28, 7), posted: true },
      { cardId: mcCredit.id, amountMinor: 54999, merchantName: "NovaElectronics", merchantCategory: "5732 - Electronics", category: "Electronics", method: "ONLINE", orderRef: "NE-3045581", description: "Laptop stand + dock bundle", at: daysAgo(26, 14), posted: true },
      { cardId: visaDebit.id, amountMinor: 650, merchantName: "CityCafe", merchantCategory: "5814 - Restaurant", category: "Dining", method: "POS", at: daysAgo(24, 12), posted: true },
      { cardId: virtual.id, amountMinor: 2499, merchantName: "BookNest", merchantCategory: "5942 - Bookstore", category: "Entertainment", method: "ONLINE", orderRef: "BN-77190", at: daysAgo(22, 21), posted: true },
      { cardId: visaDebit.id, amountMinor: 198, merchantName: "Metro Transit", merchantCategory: "4111 - Transport", category: "Transport", method: "POS", at: daysAgo(20, 8, 45), posted: true },
      { cardId: visaDebit.id, amountMinor: 899, merchantName: "PharmaPlus", merchantCategory: "5912 - Pharmacy", category: "Health", method: "POS", at: daysAgo(18, 16), posted: true },
      { cardId: mcCredit.id, amountMinor: 18999, merchantName: "Habitat Living", merchantCategory: "5719 - Home Furnishings", category: "Home & Appliances", method: "ONLINE", orderRef: "HL-55210", at: daysAgo(16, 19), posted: true },
      { cardId: visaDebit.id, amountMinor: 3345, merchantName: "Aurora Market", merchantCategory: "5411 - Supermarket", category: "Groceries", method: "POS", at: daysAgo(14, 17), posted: true },
      // Recent fortnight
      { cardId: mcCredit.id, amountMinor: 34999, merchantName: "GadgetHub", merchantCategory: "5732 - Electronics", category: "Electronics", method: "ONLINE", orderRef: "GH-190442", description: "Smart display, 2nd gen", at: daysAgo(9, 13), posted: true },
      { cardId: visaDebit.id, amountMinor: 520, merchantName: "CityCafe", merchantCategory: "5814 - Restaurant", category: "Dining", method: "POS", at: daysAgo(8, 12), posted: true },
      { cardId: visaDebit.id, amountMinor: 4180, merchantName: "Aurora Market", merchantCategory: "5411 - Supermarket", category: "Groceries", method: "POS", at: daysAgo(7, 18), posted: true },
      { cardId: virtual.id, amountMinor: 999, merchantName: "CloudHost Pro", merchantCategory: "7372 - IT Services", category: "Digital Services", method: "SUBSCRIPTION", description: "Cloud hosting", at: daysAgo(6, 10), posted: true },
      { cardId: mcCredit.id, amountMinor: 7999, merchantName: "UrbanWear", merchantCategory: "5651 - Apparel", category: "Clothing", method: "ONLINE", orderRef: "UW-90511", at: daysAgo(5, 15), posted: true },
      { cardId: visaDebit.id, amountMinor: 2240, merchantName: "Aurora Market", merchantCategory: "5411 - Supermarket", category: "Groceries", method: "POS", at: daysAgo(4, 17), posted: true },
      { cardId: visaDebit.id, amountMinor: 12000, merchantName: "PaySphere Transfer", merchantCategory: "4829 - Money Transfer", category: "Other", method: "TRANSFER", description: "Rent contribution (demo)", at: daysAgo(3, 9), posted: true },
      { cardId: mcCredit.id, amountMinor: 4999, merchantName: "NovaElectronics", merchantCategory: "5732 - Electronics", category: "Electronics", method: "ONLINE", orderRef: "NE-3067122", status: "PENDING", at: daysAgo(1, 11), posted: false },
      { cardId: visaDebit.id, amountMinor: 640, merchantName: "CityCafe", merchantCategory: "5814 - Restaurant", category: "Dining", method: "POS", status: "PENDING", at: daysAgo(0, 8, 15), posted: false },
    ];

    const createdIds: Record<string, string> = {};
    for (const s of seeds) {
      const created = await tx.transaction.create({
        data: {
          userId,
          accountId: current.id,
          cardId: s.cardId ?? null,
          direction: s.direction ?? "DEBIT",
          amountMinor: s.amountMinor,
          currency: "GBP",
          merchantName: s.merchantName,
          merchantCategory: s.merchantCategory ?? null,
          category: s.category,
          status: s.status ?? "COMPLETED",
          method: s.method,
          orderRef: s.orderRef ?? null,
          description: s.description ?? null,
          isDemo: true,
          createdAt: s.at,
          postedAt: s.posted === false ? null : s.at,
        },
      });
      if (s.orderRef) createdIds[s.orderRef] = created.id;
    }

    // ---------- Follow-ups: one resolved, one upcoming, one due now ----------
    const hlTxn = await tx.transaction.findFirst({ where: { userId, orderRef: "HL-55210" }, select: { id: true } });
    const uwTxn = await tx.transaction.findFirst({ where: { userId, orderRef: "UW-90511" }, select: { id: true } });
    const ghTxn = await tx.transaction.findFirst({ where: { userId, orderRef: "GH-190442" }, select: { id: true } });

    if (hlTxn) {
      await tx.followUp.create({
        data: {
          userId,
          transactionId: hlTxn.id,
          dueAt: daysAgo(12, 19),
          status: "RESOLVED",
          orderReceived: true,
          note: "Delivered as expected.",
          createdAt: daysAgo(16, 19),
          resolvedAt: daysAgo(11, 9),
        },
      });
    }
    if (uwTxn) {
      await tx.followUp.create({
        data: {
          userId,
          transactionId: uwTxn.id,
          dueAt: daysAgo(-1, 15), // due tomorrow
          status: "PENDING",
          createdAt: daysAgo(5, 15),
        },
      });
    }
    if (ghTxn) {
      await tx.followUp.create({
        data: {
          userId,
          transactionId: ghTxn.id,
          dueAt: daysAgo(0, 9), // due today -> appears in Follow-up Centre as due
          status: "PENDING",
          createdAt: daysAgo(9, 13),
        },
      });
    }

    // ---------- A confirmed refund example (declared by merchant, recorded by user) ----------
    const habitat = await tx.transaction.findFirst({ where: { userId, orderRef: "HL-55210" }, select: { id: true, amountMinor: true } });
    if (habitat) {
      const partial = 9499;
      await tx.refund.create({
        data: {
          userId,
          transactionId: habitat.id,
          amountMinor: partial,
          status: "CONFIRMED",
          providerRef: "RF-DEMO-3391",
          note: "Partial refund after returning one item (declared by merchant, recorded by you — demo).",
          createdAt: daysAgo(13, 10),
          resolvedAt: daysAgo(12, 10),
        },
      });
      await tx.transaction.update({ where: { id: habitat.id }, data: { refundedMinor: partial, status: "PARTIALLY_REFUNDED" } });
    }

    // ---------- A dispute example (resolved) ----------
    const book = await tx.transaction.findFirst({ where: { userId, orderRef: "BN-77190" }, select: { id: true, amountMinor: true } });
    if (book) {
      const timeline = [
        { at: daysAgo(20, 21).toISOString(), event: "DISPUTE_SUBMITTED", detail: "Customer reported item not received." },
        { at: daysAgo(19, 9).toISOString(), event: "UNDER_REVIEW", detail: "Assigned to the dispute team; merchant contacted." },
        { at: daysAgo(15, 14).toISOString(), event: "RESOLVED_WON", detail: "Merchant confirmed delivery failure; refund issued to the card." },
      ];
      await tx.dispute.create({
        data: {
          userId,
          transactionId: book.id,
          reason: "NOT_RECEIVED",
          description: "BookNest order BN-77190 never arrived; tracking shows no delivery attempt (demo example).",
          status: "RESOLVED_WON",
          timeline: JSON.stringify(timeline),
          createdAt: daysAgo(20, 21),
          updatedAt: daysAgo(15, 14),
        },
      });
      await tx.transaction.update({ where: { id: book.id }, data: { status: "REFUNDED", refundedMinor: 2499 } });
    }

    // ---------- Alerts with honest explanations ----------
    const nova = await tx.transaction.findFirst({ where: { userId, orderRef: "NE-3045581" }, select: { id: true } });
    if (nova) {
      await tx.alert.create({
        data: {
          userId,
          type: "UNUSUAL_SPEND",
          severity: "WARN",
          title: "Unusual amount for this category",
          explanation:
            "This Electronics transaction of £549.99 is 3.1x your average Electronics spend of £177.50 across 4 prior transactions. This is a statistical signal, not evidence of fraud.",
          transactionId: nova.id,
          read: true,
          createdAt: daysAgo(26, 14, 1),
        },
      });
    }
    await tx.alert.create({
      data: {
        userId,
        type: "NEW_RECURRING",
        severity: "INFO",
        title: "New recurring payment pattern",
        explanation:
          "First subscription-style payment to CloudHost Pro in the last 35 days. Recurring charges renew automatically until cancelled — check the merchant's cancellation policy.",
        read: false,
        createdAt: daysAgo(6, 10, 1),
      },
    });
    await tx.alert.create({
      data: {
        userId,
        type: "FOLLOW_UP_DUE",
        severity: "INFO",
        title: "Purchase follow-up due",
        explanation:
          "Your 4-day follow-up for GadgetHub order GH-190442 is due. Open the Follow-up Centre to record whether the order arrived.",
        read: false,
        createdAt: daysAgo(0, 9, 1),
      },
    });

    // ---------- Audit ----------
    await tx.auditEvent.create({
      data: {
        userId,
        action: "DEMO_SEED",
        detail: "Demo environment created: 2 accounts, 3 cards, 27 demo transactions, example merchant rules, budgets, follow-ups, refund and dispute examples. All records are clearly labelled DEMO.",
      },
    });
  });
}
