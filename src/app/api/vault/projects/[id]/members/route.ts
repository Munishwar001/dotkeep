import { NextResponse } from "next/server";
import { projectAccess } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { addMember, listMembers } from "@/db/members";
import { apiError, authorize, handleError, noStore, requireRole } from "@/lib/api-guard";
import { rateLimit } from "@/lib/request-guard";
import { parseMemberInvite } from "@/lib/vault-input";

type Context = { params: Promise<{ id: string }> };

// GET /api/vault/projects/:id/members  ->  { members }: the owner and everyone the project is shared with (owner only)
export async function GET(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: false });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Project not found.", 404);

  try {
    const denied = requireRole(await projectAccess(auth.userId, id), "owner", "Project not found.");
    if (denied) return denied;
    return NextResponse.json({ members: await listMembers(auth.userId, id) }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/vault/projects/:id/members  { email, role: "editor" | "viewer" }  ->  shares the project (owner only).
// Rate limited, because the answer tells you whether an email has an account.
export async function POST(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const limit = rateLimit(`invite:${auth.userId.toString()}`, 20, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many invitations. Try again later." },
      { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfter) } },
    );
  }

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Project not found.", 404);
  const parsed = parseMemberInvite(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    const denied = requireRole(await projectAccess(auth.userId, id), "owner", "Project not found.");
    if (denied) return denied;
    return NextResponse.json({ member: await addMember(auth.userId, id, parsed.data) }, { status: 201, headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
