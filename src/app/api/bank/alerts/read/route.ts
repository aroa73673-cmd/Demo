import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody } from "@/lib/api-helpers";
import { alertReadSchema } from "@/lib/validation";

/** Mark alerts as read. Body: { ids?: string[], all?: boolean } */
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
