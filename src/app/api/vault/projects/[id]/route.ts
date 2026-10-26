import { NextResponse } from "next/server";
import { projectAccess } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { deleteProject, updateProject } from "@/db/projects";
import { apiError, authorize, handleError, noStore, requireRole } from "@/lib/api-guard";
import { parseProject } from "@/lib/vault-input";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/vault/projects/:id  { name, description? }  (owner only)
export async function PATCH(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Project not found.", 404);
  const parsed = parseProject(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    const denied = requireRole(await projectAccess(auth.userId, id), "owner", "Project not found.");
    if (denied) return denied;
    const project = await updateProject(auth.userId, id, parsed.data);
    return project ? NextResponse.json({ project }, { headers: noStore }) : apiError("Project not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/vault/projects/:id  ->  deletes the project, its sharing and every secret in it (owner only)
export async function DELETE(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Project not found.", 404);

  try {
    const denied = requireRole(await projectAccess(auth.userId, id), "owner", "Project not found.");
    if (denied) return denied;
    const result = await deleteProject(auth.userId, auth.actor, id);
    return result ? NextResponse.json(result, { headers: noStore }) : apiError("Project not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
