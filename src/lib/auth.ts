/**
 * NEXUS BANK — authentication & session management.
 *
 * Security properties:
 * - Passwords: scrypt (N=16384, r=8, p=1) with 16-byte random salt, timing-safe compare.
 * - Sessions: 48-byte random tokens; only the SHA-256 hash is stored server-side.
 * - Cookies: HttpOnly, SameSite=Lax, Secure when behind HTTPS, Path=/, 7-day expiry.
 * - Sliding renewal: sessions extended when less than 2 days remain.
 * - Nothing about the session token is ever exposed to client JS.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "nb_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RENEW_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const { token, tokenHash } = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await db.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 200) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return session;
}

export type SessionUser = { id: string; email: string; name: string; sessionId: string };

/** Resolve the current user from the session cookie. Returns null when unauthenticated. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256(token);
  const session = await db.session.findUnique({ where: { tokenHash } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  // Sliding renewal
  if (session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    await db.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS), lastSeen: new Date() },
    }).catch(() => undefined);
  } else {
    await db.session.update({ where: { id: session.id }, data: { lastSeen: new Date() } }).catch(() => undefined);
  }
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) return null;
  return { ...user, sessionId: session.id };
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: sha256(token) } }).catch(() => undefined);
  }
  jar.delete(SESSION_COOKIE);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Require an authenticated user or throw a 401 HttpError. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Authentication required");
  return user;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

export function clientUserAgent(req: Request): string {
  return req.headers.get("user-agent") ?? "unknown";
}
