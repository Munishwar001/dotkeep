import { NextResponse } from "next/server";
import { secretAccess } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { restoreVersion } from "@/db/secret-history";
import { apiError, authorize, handleError, noStore, requireRole } from "@/lib/api-guard";

type Context = { params: Promise<{ id: string; versionId: string }> };

// POST /api/vault/secrets/:id/versions/:versionId/restore  ->  makes that old value the current one again.
// The value it replaces is kept in the history.
export async function POST(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const { id: rawId, versionId: rawVersionId } = await params;
  const id = parseObjectId(rawId);
  const versionId = parseObjectId(rawVersionId);
  if (!id || !versionId) return apiError("Version not found.", 404);

  try {
    const access = await secretAccess(auth.userId, id);
    const denied = requireRole(access, "write", "Version not found.");
    if (denied || !access) return denied!;
    const secret = await restoreVersion(access.ownerId, auth.actor, id, versionId);
    return secret ? NextResponse.json({ secret }, { headers: noStore }) : apiError("Version not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
