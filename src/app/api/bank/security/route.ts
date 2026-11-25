import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError } from "@/lib/api-helpers";
import { SecurityDTO } from "@/lib/types";

/** Security centre: active sessions, audit trail, and an honest protection self-assessment. */
export async function GET() {
  try {
    const user = await requireUser();

    const [sessions, auditEvents] = await Promise.all([
      db.session.findMany({
        where: { userId: user.id, expiresAt: { gt: new Date() } },
        orderBy: { lastSeen: "desc" },
        take: 20,
      }),
      db.auditEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 60 }),
    ]);

    const dto: SecurityDTO = {
      sessions: sessions.map((s) => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt.toISOString(),
        lastSeen: s.lastSeen.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        current: s.id === user.sessionId,
      })),
      auditEvents: auditEvents.map((e) => ({
        id: e.id,
        action: e.action,
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
      })),
      protections: [
        {
          name: "Password hashing",
          status: "ENABLED",
          detail: "scrypt (N=16384, r=8, p=1) with per-user random salt and timing-safe comparison.",
        },
        {
          name: "Session management",
          status: "ENABLED",
          detail: "Opaque 48-byte tokens; only SHA-256 hashes stored server-side; HttpOnly + SameSite=Lax cookies; 7-day expiry with sliding renewal.",
        },
        {
          name: "Rate limiting",
          status: "ENABLED",
          detail: "Sliding-window limiter on authentication (10/5min), registrations (8/10min) and all mutations.",
        },
        {
          name: "Input validation",
          status: "ENABLED",
          detail: "Every request body and query parameter validated with strict zod schemas; money handled as integer minor units only.",
        },
        {
          name: "Sensitive-data masking",
          status: "ENABLED",
          detail: "Card numbers are never stored — only issuer-assigned last-4 demo fragments. CVV/CVC is never collected anywhere in the product.",
        },
        {
          name: "Audit trail",
          status: "ENABLED",
          detail: "Authentication events, card controls, disputes, refunds and data changes are recorded in an append-only audit table.",
        },
        {
          name: "Account-takeover containment",
          status: "ENABLED",
          detail: "Password change revokes every other session; sign-in failures are logged with a uniform error to prevent enumeration.",
        },
        {
          name: "Secret management",
          status: "PARTIAL",
          detail: "No secrets exist in frontend code. This sandbox uses no external payment provider keys; a production build would read provider credentials from environment variables only.",
        },
        {
          name: "Payment-provider integration",
          status: "PARTIAL",
          detail: "Not connected to any live payment provider in this environment. All purchase states are user-declared demo records, labelled as such. Real integrations would require signed webhooks and provider-side idempotency keys.",
        },
        {
          name: "Encryption at rest",
          status: "PARTIAL",
          detail: "The sandbox stores data in a local SQLite file without at-rest encryption; production deployments would use an encrypted datastore with key rotation.",
        },
      ],
    };
    return ok(dto);
  } catch (err) {
    return mapError(err);
  }
}
