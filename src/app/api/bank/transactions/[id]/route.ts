import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, fail } from "@/lib/api-helpers";
import { TransactionDetailDTO, TimelineEvent } from "@/lib/types";

/** Full transaction detail: timeline, refunds, disputes, follow-ups, related alerts. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const t = await db.transaction.findFirst({
      where: { id, userId: user.id },
      include: {
        card: { select: { label: true, last4: true } },
        account: { select: { name: true } },
        refunds: { orderBy: { createdAt: "desc" } },
        disputes: { orderBy: { createdAt: "desc" } },
        followUps: { orderBy: { createdAt: "desc" } },
        alerts: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!t) return fail(404, "Transaction not found.");

    const timeline: TimelineEvent[] = [
      { at: t.createdAt.toISOString(), event: "RECORDED", detail: `Recorded via ${t.method} at ${t.merchantName}${t.isDemo ? " (demo data)" : ""}` },
      ...(t.postedAt ? [{ at: t.postedAt.toISOString(), event: "POSTED", detail: "Payment confirmed as completed." }] : []),
      ...t.disputes.flatMap((d) =>
        JSON.parse(d.timeline).map((e: TimelineEvent) => ({ at: e.at, event: e.event, detail: e.detail }))
      ),
      ...t.refunds.map((r) => ({
        at: r.createdAt.toISOString(),
        event: r.status === "CONFIRMED" ? "REFUND_CONFIRMED" : "REFUND_REQUESTED",
        detail: `${(r.amountMinor / 100).toFixed(2)} ${t.currency}${r.providerRef ? ` (ref ${r.providerRef})` : ""}${r.note ? ` — ${r.note}` : ""}`,
      })),
      ...t.followUps.map((f) => ({
        at: f.dueAt.toISOString(),
        event: "FOLLOW_UP_DUE",
        detail: `4-day follow-up ${f.status === "PENDING" ? "pending" : `resolved: ${f.orderReceived ? "order received" : "order not received"}`}`,
      })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const dto: TransactionDetailDTO = {
      id: t.id,
      accountId: t.accountId,
      cardId: t.cardId,
      direction: t.direction as TransactionDetailDTO["direction"],
      amountMinor: t.amountMinor,
      currency: t.currency,
      merchantName: t.merchantName,
      merchantCategory: t.merchantCategory,
      category: t.category,
      status: t.status as TransactionDetailDTO["status"],
      method: t.method as TransactionDetailDTO["method"],
      orderRef: t.orderRef,
      description: t.description,
      refundedMinor: t.refundedMinor,
      isDemo: t.isDemo,
      createdAt: t.createdAt.toISOString(),
      postedAt: t.postedAt?.toISOString() ?? null,
      cardLabel: t.card?.label ?? null,
      cardLast4: t.card?.last4 ?? null,
      accountName: t.account?.name,
      refunds: t.refunds.map((r) => ({
        id: r.id,
        transactionId: r.transactionId,
        amountMinor: r.amountMinor,
        status: r.status as never,
        providerRef: r.providerRef,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
      disputes: t.disputes.map((d) => ({
        id: d.id,
        transactionId: d.transactionId,
        reason: d.reason as never,
        description: d.description,
        status: d.status as never,
        timeline: JSON.parse(d.timeline),
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
      followUps: t.followUps.map((f) => ({
        id: f.id,
        transactionId: f.transactionId,
        dueAt: f.dueAt.toISOString(),
        status: f.status as never,
        orderReceived: f.orderReceived,
        note: f.note,
        createdAt: f.createdAt.toISOString(),
        resolvedAt: f.resolvedAt?.toISOString() ?? null,
      })),
      alerts: t.alerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity as never,
        title: a.title,
        explanation: a.explanation,
        transactionId: a.transactionId,
        read: a.read,
        createdAt: a.createdAt.toISOString(),
      })),
      timeline,
    };
    return ok({ transaction: dto });
  } catch (err) {
    return mapError(err);
  }
}
