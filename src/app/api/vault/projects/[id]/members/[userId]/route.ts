import { NextResponse } from "next/server";
import { projectAccess } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { removeMember, setMemberRole } from "@/db/members";
import { apiError, authorize, handleError, noStore, requireRole } from "@/lib/api-guard";
import { parseMemberRole } from "@/lib/vault-input";

type Context = { params: Promise<{ id: string; userId: string }> };

// PATCH /api/vault/projects/:id/members/:userId  { role }  ->  changes someone's role (owner only)
export async function PATCH(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const { id: rawId, userId: rawUserId } = await params;
  const id = parseObjectId(rawId);
  const memberId = parseObjectId(rawUserId);
  if (!id || !memberId) return apiError("Member not found.", 404);
  const parsed = parseMemberRole(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    const denied = requireRole(await projectAccess(auth.userId, id), "owner", "Project not found.");
    if (denied) return denied;
    const changed = await setMemberRole(auth.userId, id, memberId, parsed.data.role);
    return changed ? NextResponse.json({ ok: true }, { headers: noStore }) : apiError("Member not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/vault/projects/:id/members/:userId  ->  stops sharing with that person (owner), or leaves the
// project yourself (you, when it was shared with you).
export async function DELETE(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const { id: rawId, userId: rawUserId } = await params;
  const id = parseObjectId(rawId);
  const memberId = parseObjectId(rawUserId);
  if (!id || !memberId) return apiError("Member not found.", 404);

  try {
    const access = await projectAccess(auth.userId, id);
    const leaving = access !== null && access.role !== "owner" && memberId.equals(auth.userId);
    const denied = requireRole(access, leaving ? "read" : "owner", "Project not found.");
    if (denied) return denied;
    return (await removeMember(id, memberId)) ? NextResponse.json({ ok: true }, { headers: noStore }) : apiError("Member not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
