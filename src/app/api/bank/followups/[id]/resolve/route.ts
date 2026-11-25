import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { followUpResolveSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

/**
 * Resolve the 4-day follow-up: record whether the order arrived.
 * When orderReceived=false we surface dispute + merchant support guidance,
 * but we never auto-open a dispute — that is the user's deliberate action.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "followup-resolve", 30, 60_000, user.id);
    const { id } = await ctx.params;
    const input = await parseBody(req, followUpResolveSchema);

    const fu = await db.followUp.findFirst({ where: { id, userId: user.id } });
    if (!fu) return fail(404, "Follow-up not found.");
    if (fu.status !== "PENDING") return fail(409, "This follow-up is already resolved.");

    const updated = await db.followUp.update({
      where: { id },
      data: {
        status: "RESOLVED",
        orderReceived: input.orderReceived,
        note: input.note || null,
        resolvedAt: new Date(),
      },
    });

    if (!input.orderReceived) {
      await db.alert.create({
        data: {
          userId: user.id,
          type: "FOLLOW_UP_DUE",
          severity: "WARN",
          title: "Order not received",
          explanation:
            "You recorded that an order has not arrived. Next steps: 1) check the merchant order page and tracking, " +
            "2) contact merchant support and allow their stated resolution window, 3) if unresolved, open a " +
            "'not received' dispute from the transaction view. Nothing was automatically disputed.",
          transactionId: fu.transactionId,
        },
      });
    }

    await audit("FOLLOW_UP_RESOLVED", `Follow-up ${id}: order ${input.orderReceived ? "received" : "NOT received"}`, user.id);
    return ok({
      followUp: {
        id: updated.id,
        transactionId: updated.transactionId,
        dueAt: updated.dueAt.toISOString(),
        status: updated.status,
        orderReceived: updated.orderReceived,
        note: updated.note,
        createdAt: updated.createdAt.toISOString(),
        resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      },
      nextStep: input.orderReceived
        ? null
        : {
            guidance:
              "Since the order was not received: 1) check the merchant order status and tracking, 2) contact merchant support " +
              "(most retailers respond within 48h), 3) if the merchant cannot resolve it, open a NOT_RECEIVED dispute from " +
              "the transaction detail view. Your dispute rights and timelines are explained in the Dispute Centre.",
          },
    });
  } catch (err) {
    return mapError(err);
  }
}
