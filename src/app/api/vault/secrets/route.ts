import { NextResponse } from "next/server";
import { projectAccess } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { createSecret, listSecrets } from "@/db/secrets";
import { apiError, authorize, handleError, noStore, requireRole } from "@/lib/api-guard";
import { parseSecretCreate } from "@/lib/vault-input";

// GET /api/vault/secrets?projectId=...  ->  the secrets of your projects and those shared with you. The values are never included, only names and details.
export async function GET(request: Request) {
  const auth = await authorize(request, { mutating: false });
  if (auth instanceof Response) return auth;

  const rawProjectId = new URL(request.url).searchParams.get("projectId");
  const projectId = rawProjectId ? parseObjectId(rawProjectId) : undefined;
  if (rawProjectId && !projectId) return apiError("Project not found.", 404);

  try {
    return NextResponse.json({ secrets: await listSecrets(auth.userId, { projectId: projectId ?? undefined }) }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/vault/secrets  { projectId, name, environment, type, value }  ->  stores the value encrypted
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const parsed = parseSecretCreate(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);
  const projectId = parseObjectId(parsed.data.projectId);
  if (!projectId) return apiError("Project not found.", 404);

  try {
    const access = await projectAccess(auth.userId, projectId);
    const denied = requireRole(access, "write", "Project not found.");
    if (denied || !access) return denied!;
    const secret = await createSecret(access.ownerId, auth.actor, { ...parsed.data, projectId });
    return secret ? NextResponse.json({ secret }, { status: 201, headers: noStore }) : apiError("Project not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
