import { db } from "@/lib/db";
import { verifyPassword, createSession, clientIp, clientUserAgent } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { audit } from "@/lib/audit";
import { seedDemoData } from "@/lib/seed";

export async function POST(req: Request) {
  try {
    enforceRateLimit(req, "auth-login", 10, 5 * 60_000);
    const input = await parseBody(req, loginSchema);

    const user = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    // Uniform error to avoid account enumeration; timing-safe verification happens regardless.
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      await audit("AUTH_LOGIN_FAILED", `Failed sign-in attempt for ${input.email}`);
      return fail(401, "Invalid email or password.");
    }

    await createSession(user.id, { ip: clientIp(req), userAgent: clientUserAgent(req) });
    await seedDemoData(user.id, user.name); // no-op if already seeded
    await audit("AUTH_LOGIN", "Signed in", user.id);

    return ok({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    return mapError(err);
  }
}
