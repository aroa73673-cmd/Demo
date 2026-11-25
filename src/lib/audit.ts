/**
 * NEXUS BANK — audit trail helper. Security-relevant actions are recorded here.
 */
import { db } from "@/lib/db";

export async function audit(action: string, detail: string, userId?: string | null): Promise<void> {
  await db.auditEvent.create({
    data: { userId: userId ?? null, action: action.slice(0, 60), detail: detail.slice(0, 500) },
  }).catch(() => undefined);
}
