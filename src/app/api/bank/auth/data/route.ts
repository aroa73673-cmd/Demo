import { db } from "@/lib/db";
import { requireUser, destroyCurrentSession } from "@/lib/auth";
import { ok, mapError } from "@/lib/api-helpers";
import { audit } from "@/lib/audit";

/** Delete every record belonging to the current user (GDPR-style erasure), then sign out. */
export async function DELETE() {
  try {
    const user = await requireUser();
    const id = user.id;
    await db.user.delete({ where: { id } }); // cascade removes all owned records
    await db.auditEvent.create({
      data: { action: "DATA_ERASED", detail: `All data erased for ${id}` },
    });
    await destroyCurrentSession();
    return ok({ erased: true });
  } catch (err) {
    return mapError(err);
  }
}
