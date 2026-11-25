import { db } from "@/lib/db";
import { requireUser, hashPassword, verifyPassword } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { passwordChangeSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

/** Change password. Revokes every other session (account-takeover containment). */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "auth-password", 5, 15 * 60_000, user.id);
    const input = await parseBody(req, passwordChangeSchema);

    const record = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!record || !verifyPassword(input.currentPassword, record.passwordHash)) {
      await audit("PASSWORD_CHANGE_FAILED", "Wrong current password", user.id);
      return fail(401, "Current password is incorrect.");
    }

    await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(input.newPassword) } });
    // Kill all other sessions; keep the current one.
    await db.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
    await audit("PASSWORD_CHANGED", "Password changed; all other sessions revoked", user.id);
    return ok({ changed: true });
  } catch (err) {
    return mapError(err);
  }
}
