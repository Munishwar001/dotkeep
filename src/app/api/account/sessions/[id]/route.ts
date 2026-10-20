import { NextResponse } from "next/server";
import { parseObjectId } from "@/db/collections";
import { revokeSession } from "@/db/sessions";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";

type Context = { params: Promise<{ id: string }> };

// DELETE /api/account/sessions/:id  ->  logs that device out. Only your own sessions can be ended.
export async function DELETE(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true, vault: false });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Session not found.", 404);

  try {
    return (await revokeSession(auth.userId, id)) ? NextResponse.json({ ok: true }, { headers: noStore }) : apiError("Session not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
