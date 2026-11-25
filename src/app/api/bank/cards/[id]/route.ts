import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { cardPolicySchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { CardDTO } from "@/lib/types";

/** Card detail with its recent transactions. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const card = await db.card.findFirst({ where: { id, userId: user.id } });
    if (!card) return fail(404, "Card not found.");

    const transactions = await db.transaction.findMany({
      where: { userId: user.id, cardId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, direction: true, amountMinor: true, currency: true, merchantName: true,
        category: true, status: true, method: true, orderRef: true, createdAt: true,
      },
    });
    return ok({ card, transactions });
  } catch (err) {
    return mapError(err);
  }
}

/** Update card controls: limits and permissions (future-transaction policy). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "card-patch", 60, 60_000, user.id);
    const { id } = await ctx.params;
    const input = await parseBody(req, cardPolicySchema);

    const card = await db.card.findFirst({ where: { id, userId: user.id } });
    if (!card) return fail(404, "Card not found.");
    if (card.status === "REPLACED") return fail(409, "This card has been replaced and can no longer be changed.");

    // Guardrail: daily limit must not be below per-tx limit.
    const perTx = input.perTxLimitMinor ?? card.perTxLimitMinor;
    const daily = input.dailyLimitMinor ?? card.dailyLimitMinor;
    const monthly = input.monthlyLimitMinor ?? card.monthlyLimitMinor;
    if (perTx > daily) return fail(400, "Per-transaction limit cannot exceed the daily limit.");
    if (daily > monthly) return fail(400, "Daily limit cannot exceed the monthly limit.");

    const updated = await db.card.update({
      where: { id },
      data: {
        label: input.label ?? card.label,
        perTxLimitMinor: perTx,
        dailyLimitMinor: daily,
        monthlyLimitMinor: monthly,
        onlineAllowed: input.onlineAllowed ?? card.onlineAllowed,
        contactlessAllowed: input.contactlessAllowed ?? card.contactlessAllowed,
        internationalAllowed: input.internationalAllowed ?? card.internationalAllowed,
        atmAllowed: input.atmAllowed ?? card.atmAllowed,
      },
    });
    await audit("CARD_UPDATED", `Controls updated on ${card.label} (*** ${card.last4})`, user.id);
    const dto: CardDTO = { ...cardToDTOFields(updated), spentTodayMinor: 0, spentThisMonthMinor: 0 };
    return ok({ card: dto });
  } catch (err) {
    return mapError(err);
  }
}

function cardToDTOFields(c: {
  id: string; accountId: string; label: string; kind: string; network: string; holderName: string;
  last4: string; expiryMonth: number; expiryYear: number; status: string; perTxLimitMinor: number;
  dailyLimitMinor: number; monthlyLimitMinor: number; onlineAllowed: boolean; contactlessAllowed: boolean;
  internationalAllowed: boolean; atmAllowed: boolean; isDemo: boolean;
}): CardDTO {
  return {
    id: c.id, accountId: c.accountId, label: c.label, kind: c.kind as CardDTO["kind"],
    network: c.network as CardDTO["network"], holderName: c.holderName, last4: c.last4,
    expiryMonth: c.expiryMonth, expiryYear: c.expiryYear, status: c.status as CardDTO["status"],
    perTxLimitMinor: c.perTxLimitMinor, dailyLimitMinor: c.dailyLimitMinor,
    monthlyLimitMinor: c.monthlyLimitMinor, onlineAllowed: c.onlineAllowed,
    contactlessAllowed: c.contactlessAllowed, internationalAllowed: c.internationalAllowed,
    atmAllowed: c.atmAllowed, isDemo: c.isDemo,
  };
}
