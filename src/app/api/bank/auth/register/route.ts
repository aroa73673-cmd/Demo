import { db } from "@/lib/db";
import { hashPassword, createSession, clientIp, clientUserAgent } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { audit } from "@/lib/audit";
import { seedDemoData } from "@/lib/seed";

export async function POST(req: Request) {
  try {
    enforceRateLimit(req, "auth-register", 8, 10 * 60_000);
    const input = await parseBody(req, registerSchema);

    const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) return fail(409, "An account with this email already exists.");

    const user = await db.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: hashPassword(input.password),
      },
      select: { id: true, email: true, name: true },
    });

    await createSession(user.id, { ip: clientIp(req), userAgent: clientUserAgent(req) });
    // Honest demo environment: new users get a clearly-labelled demo sandbox.
    await seedDemoData(user.id, user.name);
    await audit("AUTH_REGISTER", `Account created for ${user.email}`, user.id);

    return ok({ user }, 201);
  } catch (err) {
    return mapError(err);
  }
}
