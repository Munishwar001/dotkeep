import { NextResponse } from "next/server";
import { updateMaskEmails } from "@/db/account";
import { apiError, authorizeAdmin, handleError, noStore } from "@/lib/api-guard";

// PATCH /api/admin/preferences  { maskEmails: boolean }  ->  show other users' emails masked on the Admin page (admin only).
export async function PATCH(request: Request) {
  const auth = await authorizeAdmin(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => null)) as { maskEmails?: unknown } | null;
  if (typeof body?.maskEmails !== "boolean") return apiError("Choose on or off.", 400);

  try {
    return (await updateMaskEmails(auth.userId, body.maskEmails))
      ? NextResponse.json({ maskEmails: body.maskEmails }, { headers: noStore })
      : apiError("Account not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
