import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await requireUser();
    const accounts = await db.account.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, type: true, currency: true, balanceMinor: true, isDemo: true },
    });
    return ok({ user: { id: user.id, email: user.email, name: user.name }, accounts });
  } catch (err) {
    return mapError(err);
  }
}
