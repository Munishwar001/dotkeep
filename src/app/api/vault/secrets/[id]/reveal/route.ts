import { NextResponse } from "next/server";
import { secretAccess } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { revealSecret } from "@/db/secrets";
import { apiError, authorize, handleError, noStore, requireRole } from "@/lib/api-guard";
import { rateLimit } from "@/lib/request-guard";

type Context = { params: Promise<{ id: string }> };

// POST /api/vault/secrets/:id/reveal  ->  { value }. This is the ONLY place a stored value is decrypted and sent out.
// It is a POST (not a GET) so the same-origin check applies, and it is rate limited so a stolen session
// can't quietly pull out every secret.
export async function POST(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const limit = await rateLimit(`reveal:${auth.userId.toString()}`, 30, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many reveals. Wait a moment and try again." },
      { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfter) } },
    );
  }

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Secret not found.", 404);

  try {
    const access = await secretAccess(auth.userId, id);
    const denied = requireRole(access, "read", "Secret not found.");
    if (denied || !access) return denied!;
    const value = await revealSecret(access.ownerId, auth.actor, id);
    return value === null ? apiError("Secret not found.", 404) : NextResponse.json({ value }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
