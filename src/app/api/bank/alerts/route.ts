import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody } from "@/lib/api-helpers";
import { alertReadSchema } from "@/lib/validation";
import { AlertDTO } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const alerts = await db.alert.findMany({
      where: { userId: user.id, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const out: AlertDTO[] = alerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity as AlertDTO["severity"],
      title: a.title,
      explanation: a.explanation,
      transactionId: a.transactionId,
      read: a.read,
      createdAt: a.createdAt.toISOString(),
    }));
    return ok({ alerts: out, unreadCount: out.filter((a) => !a.read).length });
  } catch (err) {
    return mapError(err);
  }
}

/** Mark alerts read (specific ids or all). */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, alertReadSchema);
    if (input.all) {
      await db.alert.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
    } else if (input.ids?.length) {
      await db.alert.updateMany({ where: { userId: user.id, id: { in: input.ids } }, data: { read: true } });
    }
    return ok({ done: true });
  } catch (err) {
    return mapError(err);
  }
}
