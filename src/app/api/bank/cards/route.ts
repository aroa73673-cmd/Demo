import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { cardCreateSchema } from "@/lib/validation";
import { randomInt } from "crypto";
import { audit } from "@/lib/audit";
import { startOfDay, startOfMonth } from "@/lib/money";
import { CardDTO } from "@/lib/types";

function toCardDTO(
  c: {
    id: string; accountId: string; label: string; kind: string; network: string; holderName: string;
    last4: string; expiryMonth: number; expiryYear: number; status: string; perTxLimitMinor: number;
    dailyLimitMinor: number; monthlyLimitMinor: number; onlineAllowed: boolean; contactlessAllowed: boolean;
    internationalAllowed: boolean; atmAllowed: boolean; isDemo: boolean;
  },
  spentTodayMinor = 0,
  spentThisMonthMinor = 0,
): CardDTO {
  return {
    id: c.id,
    accountId: c.accountId,
    label: c.label,
    kind: c.kind as CardDTO["kind"],
    network: c.network as CardDTO["network"],
    holderName: c.holderName,
    last4: c.last4,
    expiryMonth: c.expiryMonth,
    expiryYear: c.expiryYear,
    status: c.status as CardDTO["status"],
    perTxLimitMinor: c.perTxLimitMinor,
    dailyLimitMinor: c.dailyLimitMinor,
    monthlyLimitMinor: c.monthlyLimitMinor,
    onlineAllowed: c.onlineAllowed,
    contactlessAllowed: c.contactlessAllowed,
    internationalAllowed: c.internationalAllowed,
    atmAllowed: c.atmAllowed,
    isDemo: c.isDemo,
    spentTodayMinor,
    spentThisMonthMinor,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const cards = await db.card.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    const now = new Date();
    const out: CardDTO[] = [];
    for (const c of cards) {
      const [day, month] = await Promise.all([
        db.transaction.aggregate({
          where: {
            userId: user.id, cardId: c.id, direction: "DEBIT",
            status: { in: ["PENDING", "COMPLETED", "DISPUTED", "PARTIALLY_REFUNDED", "REFUNDED"] },
            createdAt: { gte: startOfDay(now) },
          },
          _sum: { amountMinor: true },
        }),
        db.transaction.aggregate({
          where: {
            userId: user.id, cardId: c.id, direction: "DEBIT",
            status: { in: ["PENDING", "COMPLETED", "DISPUTED", "PARTIALLY_REFUNDED", "REFUNDED"] },
            createdAt: { gte: startOfMonth(now) },
          },
          _sum: { amountMinor: true },
        }),
      ]);
      out.push(toCardDTO(c, day._sum.amountMinor ?? 0, month._sum.amountMinor ?? 0));
    }
    return ok({ cards: out });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * Add a card to the demo environment. Only VIRTUAL cards can be created here —
 * a real physical card can only come from a real issuer, so this endpoint is
 * explicit that what it creates is a demo sandbox card, never a payment instrument.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "card-create", 20, 60_000, user.id);
    const input = await parseBody(req, cardCreateSchema);

    const account = await db.account.findFirst({ where: { id: input.accountId, userId: user.id } });
    if (!account) return fail(404, "Account not found.");

    const last4 = String(randomInt(0, 10000)).padStart(4, "0");
    const expiryMonth = randomInt(1, 13);
    const expiryYear = new Date().getFullYear() + 4;

    const kind = input.kind === "DEBIT" || input.kind === "CREDIT" ? "VIRTUAL" : input.kind;
    const card = await db.card.create({
      data: {
        userId: user.id,
        accountId: account.id,
        label: input.label,
        kind,
        network: input.network,
        holderName: input.holderName.toUpperCase(),
        last4,
        expiryMonth,
        expiryYear,
        status: "ACTIVE",
        perTxLimitMinor: input.perTxLimitMinor,
        dailyLimitMinor: input.dailyLimitMinor,
        monthlyLimitMinor: input.monthlyLimitMinor,
        onlineAllowed: input.onlineAllowed,
        contactlessAllowed: input.contactlessAllowed,
        internationalAllowed: input.internationalAllowed,
        atmAllowed: input.atmAllowed,
        isDemo: true,
      },
    });
    await audit("CARD_CREATED", `Demo virtual card ${card.label} (*** ${last4}) added`, user.id);
    return ok({ card: toCardDTO(card) }, 201);
  } catch (err) {
    return mapError(err);
  }
}
