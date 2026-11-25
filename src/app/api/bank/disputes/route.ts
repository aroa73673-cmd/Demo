import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, fail } from "@/lib/api-helpers";
import { DisputeDTO, TransactionDTO } from "@/lib/types";
import { Prisma } from "@prisma/client";

type DisputeRow = Prisma.DisputeGetPayload<{ include: { transaction: true } }>;

function toDTO(d: DisputeRow): DisputeDTO {
  return {
    id: d.id,
    transactionId: d.transactionId,
    reason: d.reason as DisputeDTO["reason"],
    description: d.description,
    status: d.status as DisputeDTO["status"],
    timeline: JSON.parse(d.timeline),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    transaction: {
      id: d.transaction.id,
      accountId: d.transaction.accountId,
      cardId: d.transaction.cardId,
      direction: d.transaction.direction as "DEBIT" | "CREDIT",
      amountMinor: d.transaction.amountMinor,
      currency: d.transaction.currency,
      merchantName: d.transaction.merchantName,
      merchantCategory: d.transaction.merchantCategory,
      category: d.transaction.category,
      status: d.transaction.status as TransactionDTO["status"],
      method: d.transaction.method as never,
      orderRef: d.transaction.orderRef,
      description: d.transaction.description,
      refundedMinor: d.transaction.refundedMinor,
      isDemo: d.transaction.isDemo,
      createdAt: d.transaction.createdAt.toISOString(),
      postedAt: d.transaction.postedAt?.toISOString() ?? null,
    },
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const disputes = await db.dispute.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { transaction: true },
    });
    return ok({ disputes: disputes.map(toDTO) });
  } catch (err) {
    return mapError(err);
  }
}
