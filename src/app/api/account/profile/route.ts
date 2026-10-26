import { NextResponse } from "next/server";
import { updateName } from "@/db/account";
import { parseProfile } from "@/lib/account-input";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";

// PATCH /api/account/profile  { name }  ->  changes your display name
export async function PATCH(request: Request) {
  const auth = await authorize(request, { mutating: true, vault: false });
  if (auth instanceof Response) return auth;

  const parsed = parseProfile(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    return (await updateName(auth.userId, parsed.data.name))
      ? NextResponse.json({ name: parsed.data.name }, { headers: noStore })
      : apiError("Account not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
