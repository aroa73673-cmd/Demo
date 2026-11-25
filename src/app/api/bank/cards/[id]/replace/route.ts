import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { replaceSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { randomInt } from "crypto";

/**
 * Report a card lost/stolen/damaged/compromised. The old card is marked REPLACED
 * (permanently unusable) and a replacement demo card is issued and linked.
 * In a live bank this would also trigger network token re-issuance.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "card-replace", 10, 60_000, user.id);
    const { id } = await ctx.params;
    const input = await parseBody(req, replaceSchema);

    const card = await db.card.findFirst({ where: { id, userId: user.id } });
    if (!card) return fail(404, "Card not found.");
    if (card.status === "REPLACED") return fail(409, "This card has already been replaced.");

    const last4 = String(randomInt(0, 10000)).padStart(4, "0");
    const replacement = await db.card.create({
      data: {
        userId: user.id,
        accountId: card.accountId,
        label: `${card.label} (replacement)`,
        kind: card.kind,
        network: card.network,
        holderName: card.holderName,
        last4,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear + 2,
        status: "ACTIVE",
        perTxLimitMinor: card.perTxLimitMinor,
        dailyLimitMinor: card.dailyLimitMinor,
        monthlyLimitMinor: card.monthlyLimitMinor,
        onlineAllowed: card.onlineAllowed,
        contactlessAllowed: card.contactlessAllowed,
        internationalAllowed: card.internationalAllowed,
        atmAllowed: card.atmAllowed,
        isDemo: true,
      },
    });
    await db.card.update({ where: { id }, data: { status: "REPLACED", replacedByCardId: replacement.id } });
    await audit(
      "CARD_REPLACED",
      `${card.label} (*** ${card.last4}) reported ${input.reason}; replacement *** ${last4} issued (demo)`,
      user.id,
    );
    return ok({ replacementId: replacement.id, reason: input.reason, originalStatus: "REPLACED" }, 201);
  } catch (err) {
    return mapError(err);
  }
}
