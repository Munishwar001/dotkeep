import { NextResponse } from "next/server";
import { adminDeleteUser, setUserBlocked, type AdminActionResult } from "@/db/admin";
import { parseObjectId } from "@/db/collections";
import { apiError, authorizeAdmin, handleError, noStore } from "@/lib/api-guard";

type Context = { params: Promise<{ id: string }> };

const REFUSED = {
  "not-found": () => apiError("User not found.", 404),
  self: () => apiError("You can’t do that to your own account.", 403),
  admin: () => apiError("You can’t do that to another admin. Remove their admin role first (npm run remove-admin).", 403),
} as const;

const refuse = (result: Exclude<AdminActionResult, { ok: true }>) => REFUSED[result.reason]();

// PATCH /api/admin/users/:id  { blocked: boolean }  ->  blocks or unblocks a user (admin only).
// Blocking ends all of their sessions and stops them from logging in. Their data is kept.
export async function PATCH(request: Request, { params }: Context) {
  const auth = await authorizeAdmin(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("User not found.", 404);
  const body = (await request.json().catch(() => null)) as { blocked?: unknown } | null;
  if (typeof body?.blocked !== "boolean") return apiError("Say whether to block or unblock.", 400);

  try {
    const result = await setUserBlocked(auth.userId, id, body.blocked);
    return result.ok ? NextResponse.json({ blocked: body.blocked }, { headers: noStore }) : refuse(result);
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/admin/users/:id  ->  deletes the user, their projects, secrets and sessions (admin only). Can't be undone.
export async function DELETE(request: Request, { params }: Context) {
  const auth = await authorizeAdmin(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("User not found.", 404);

  try {
    const result = await adminDeleteUser(auth.userId, id);
    return result.ok ? NextResponse.json({ ok: true }, { headers: noStore }) : refuse(result);
  } catch (error) {
    return handleError(error);
  }
}
