import { destroyCurrentSession, getSessionUser } from "@/lib/auth";
import { ok, mapError } from "@/lib/api-helpers";
import { audit } from "@/lib/audit";

export async function POST() {
  try {
    const user = await getSessionUser();
    await destroyCurrentSession();
    if (user) await audit("AUTH_LOGOUT", "Signed out", user.id);
    return ok({ signedOut: true });
  } catch (err) {
    return mapError(err);
  }
}
