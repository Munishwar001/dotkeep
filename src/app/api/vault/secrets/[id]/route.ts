import { NextResponse } from "next/server";
import { projectAccess, secretAccess } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { deleteSecret, updateSecret } from "@/db/secrets";
import { apiError, authorize, handleError, noStore, requireRole } from "@/lib/api-guard";
import { parseSecretUpdate } from "@/lib/vault-input";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/vault/secrets/:id  { name?, environment?, type?, value?, projectId? }  ->  only the fields you send change.
// A new projectId moves the secret to another of your projects. A new value keeps the old one in the history.
export async function PATCH(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Secret not found.", 404);
  const parsed = parseSecretUpdate(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  const { projectId: rawProjectId, ...rest } = parsed.data;
  const projectId = rawProjectId ? parseObjectId(rawProjectId) : undefined;
  if (rawProjectId && !projectId) return apiError("Project not found.", 404);

  try {
    const access = await secretAccess(auth.userId, id);
    const denied = requireRole(access, "write", "Secret not found.");
    if (denied || !access) return denied!;
    if (projectId) {
      const target = await projectAccess(auth.userId, projectId);
      const deniedTarget = requireRole(target, "write", "Project not found.");
      if (deniedTarget) return deniedTarget;
    }
    const secret = await updateSecret(access.ownerId, auth.actor, id, { ...rest, ...(projectId ? { projectId } : {}) });
    return secret ? NextResponse.json({ secret }, { headers: noStore }) : apiError("Secret not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/vault/secrets/:id
export async function DELETE(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Secret not found.", 404);

  try {
    const access = await secretAccess(auth.userId, id);
    const denied = requireRole(access, "write", "Secret not found.");
    if (denied || !access) return denied!;
    return (await deleteSecret(access.ownerId, auth.actor, id)) ? NextResponse.json({ ok: true }, { headers: noStore }) : apiError("Secret not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
