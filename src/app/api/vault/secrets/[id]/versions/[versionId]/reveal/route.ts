import { NextResponse } from "next/server";
import { secretAccess } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { revealVersion } from "@/db/secret-history";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { rateLimit } from "@/lib/request-guard";

type Context = { params: Promise<{ id: string; versionId: string }> };

// POST /api/vault/secrets/:id/versions/:versionId/reveal  ->  { value }. Same rules as revealing the current value:
// POST only, same-origin, rate limited (shares the budget with normal reveals), and written to the audit log.
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

  const { id: rawId, versionId: rawVersionId } = await params;
  const id = parseObjectId(rawId);
  const versionId = parseObjectId(rawVersionId);
  if (!id || !versionId) return apiError("Version not found.", 404);

  try {
    const access = await secretAccess(auth.userId, id);
    if (!access) return apiError("Version not found.", 404);
    const value = await revealVersion(access.ownerId, auth.actor, id, versionId);
    return value === null ? apiError("Version not found.", 404) : NextResponse.json({ value }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
