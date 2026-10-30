import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { markStepUp } from "@/db/sessions";
import { confirmTwoFactorSetup } from "@/db/two-factor";
import { findUserById } from "@/db/users";
import { parseTwoFactorCode } from "@/lib/account-input";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { limitTwoFactorChanges } from "@/lib/two-factor-guard";

// POST /api/account/2fa/enable  { code }  ->  { recoveryCodes }
// Finishes setup: the code proves the authenticator app has the secret. The recovery codes are shown once, here.
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const limited = await limitTwoFactorChanges(auth.userId);
  if (limited) return limited;

  const parsed = parseTwoFactorCode(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    const user = await findUserById(auth.userId);
    if (!user) return apiError("Account not found.", 404);
    if (user.twoFactor) return apiError("Two-factor authentication is already turned on.", 409);
    if (!user.twoFactorPending) return apiError("Start setup again to get a new QR code.", 409);

    const recoveryCodes = await confirmTwoFactorSetup(user, parsed.data.code);
    if (!recoveryCodes) return apiError("That code isn’t right. Check the code in your app and try again.", 400);
    // The code just proved this session, so it isn't asked again right away.
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) await markStepUp(token);
    return NextResponse.json({ recoveryCodes }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
