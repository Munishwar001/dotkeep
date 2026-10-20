import { NextResponse } from "next/server";
import { parseObjectId } from "@/db/collections";
import { deleteProject, updateProject } from "@/db/projects";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { parseProject } from "@/lib/vault-input";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/vault/projects/:id  { name, description? }
export async function PATCH(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Project not found.", 404);
  const parsed = parseProject(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    const project = await updateProject(auth.userId, id, parsed.data);
    return project ? NextResponse.json({ project }, { headers: noStore }) : apiError("Project not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/vault/projects/:id  ->  deletes the project and every secret in it
export async function DELETE(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Project not found.", 404);

  try {
    const result = await deleteProject(auth.userId, id);
    return result ? NextResponse.json(result, { headers: noStore }) : apiError("Project not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
