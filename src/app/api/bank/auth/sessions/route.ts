import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, fail } from "@/lib/api-helpers";
import { audit } from "@/lib/audit";

/** List the user's active sessions (masked). */
export async function GET() {
  try {
    const user = await requireUser();
    const sessions = await db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { lastSeen: "desc" },
      select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeen: true, expiresAt: true },
    });
    return ok({
      sessions: sessions.map((s) => ({ ...s, current: s.id === user.sessionId })),
    });
  } catch (err) {
    return mapError(err);
  }
}

/** Revoke one session by id (only your own). */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    let body: { id?: string };
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const id = body.id;
    if (!id || typeof id !== "string") return fail(400, "Session id is required.");
    const session = await db.session.findFirst({ where: { id, userId: user.id } });
    if (!session) return fail(404, "Session not found.");
    await db.session.delete({ where: { id } });
    await audit("SESSION_REVOKED", `Session ${id} revoked`, user.id);
    return ok({ revoked: id });
  } catch (err) {
    return mapError(err);
  }
}
