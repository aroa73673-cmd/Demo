import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { freezeSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

/**
 * Freeze / unfreeze. Freezing blocks ALL new transactions on the card until
 * unfrozen by the cardholder. Recurring payments are also declined while
 * frozen — exactly like a real issuer freeze.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "card-freeze", 30, 60_000, user.id);
    const { id } = await ctx.params;
    const input = await parseBody(req, freezeSchema);

    const card = await db.card.findFirst({ where: { id, userId: user.id } });
    if (!card) return fail(404, "Card not found.");
    if (card.status === "REPLACED") return fail(409, "This card has been replaced; freezing is not applicable.");
    if (card.status === "BLOCKED") return fail(409, "This card is blocked by the bank. Contact support to resolve.");

    const updated = await db.card.update({
      where: { id },
      data: { status: input.frozen ? "FROZEN" : "ACTIVE" },
    });
    await audit(
      input.frozen ? "CARD_FROZEN" : "CARD_UNFROZEN",
      `${card.label} (*** ${card.last4}) ${input.frozen ? "frozen" : "unfrozen"} by cardholder`,
      user.id,
    );
    return ok({ card: { ...updated, status: updated.status } });
  } catch (err) {
    return mapError(err);
  }
}
