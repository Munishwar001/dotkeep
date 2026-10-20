import { NextResponse } from "next/server";
import { updateRevealSeconds } from "@/db/account";
import { parsePreferences } from "@/lib/account-input";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";

// PATCH /api/account/preferences  { revealSeconds }  ->  how long a revealed secret stays visible
export async function PATCH(request: Request) {
  const auth = await authorize(request, { mutating: true, vault: false });
  if (auth instanceof Response) return auth;

  const parsed = parsePreferences(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    return (await updateRevealSeconds(auth.userId, parsed.data.revealSeconds))
      ? NextResponse.json(parsed.data, { headers: noStore })
      : apiError("Account not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
