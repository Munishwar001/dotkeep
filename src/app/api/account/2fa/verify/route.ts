import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { markStepUp, STEP_UP_MINUTES } from "@/db/sessions";
import { verifySecondFactor } from "@/db/two-factor";
import { findUserById } from "@/db/users";
import { parseTwoFactorCode } from "@/lib/account-input";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { rateLimit } from "@/lib/request-guard";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// POST /api/account/2fa/verify  { code }  ->  proves this session with a 2FA code for the next few minutes.
// The vault asks for it before it reveals or exports secret values (see requireStepUp in api-guard.ts).
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  // Own counter, so using the vault normally never eats into the Settings limit. Stops a stolen session guessing codes.
  const limit = await rateLimit(`2fa-stepup:${auth.userId.toString()}`, 10, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfter) } },
    );
  }

  const parsed = parseTwoFactorCode(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    const user = await findUserById(auth.userId);
    if (!user) return apiError("Account not found.", 404);
    if (!user.twoFactor) return apiError("Two-factor authentication isn’t turned on.", 409);
    if (!(await verifySecondFactor(user, parsed.data.code))) {
      // A code works once, so one just used to sign in is refused here too. Say so, or it looks like a typo.
      return apiError("That code isn’t right, or it was just used. Wait for your app to show the next code and try again.", 400);
    }
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) await markStepUp(token);
    return NextResponse.json({ ok: true, minutes: STEP_UP_MINUTES }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
