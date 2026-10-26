import { NextResponse } from "next/server";
import { secretAccess } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { listVersions } from "@/db/secret-history";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";

type Context = { params: Promise<{ id: string }> };

// GET /api/vault/secrets/:id/versions  ->  { versions: [{ id, createdAt }] }, newest first. Never includes values.
export async function GET(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: false });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Secret not found.", 404);

  try {
    const access = await secretAccess(auth.userId, id);
    if (!access) return apiError("Secret not found.", 404);
    const versions = await listVersions(access.ownerId, id);
    return versions ? NextResponse.json({ versions }, { headers: noStore }) : apiError("Secret not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
