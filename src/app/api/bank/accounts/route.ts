import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, mapError, parseBody, enforceRateLimit, fail } from "@/lib/api-helpers";
import { accountCreateSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { Account } from "@prisma/client";

function dto(a: Account) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    balanceMinor: a.balanceMinor,
    isDemo: a.isDemo,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const accounts = await db.account.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    return ok({ accounts: accounts.map(dto) });
  } catch (err) {
    return mapError(err);
  }
}

/** Open an additional demo account (CURRENT or SAVINGS). */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    enforceRateLimit(req, "account-create", 10, 60_000, user.id);
    const input = await parseBody(req, accountCreateSchema);
    const account = await db.account.create({
      data: {
        userId: user.id,
        name: input.name,
        type: input.type,
        currency: "GBP",
        balanceMinor: 0,
        isDemo: true,
      },
    });
    await audit("ACCOUNT_CREATED", `Demo ${input.type} account "${input.name}" opened`, user.id);
    return ok({ account: dto(account) }, 201);
  } catch (err) {
    return mapError(err);
  }
}
