import { NextResponse } from "next/server";
import { setSecretsNeedCode } from "@/db/two-factor";
import { parsePasswordAndCode, parseSecretsLock } from "@/lib/account-input";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { limitTwoFactorChanges, requirePasswordAndCode } from "@/lib/two-factor-guard";

// POST /api/account/2fa/secrets-lock  { enabled: true }                      ->  ask for a code before secret values are shown
//                                     { enabled: false, password, code }     ->  stop asking
// Turning it ON is always safe, so it needs nothing extra. Turning it OFF needs the password and a current code, so
// someone on a stolen or left-open session can't just switch the protection off.
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const limited = await limitTwoFactorChanges(auth.userId);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const parsed = parseSecretsLock(body);
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    if (!parsed.data.enabled) {
      const proof = parsePasswordAndCode(body);
      if (!proof.ok) return apiError(proof.error, 400);
      const user = await requirePasswordAndCode(auth.userId, proof.data.password, proof.data.code);
      if (user instanceof Response) return user;
    }
    if (!(await setSecretsNeedCode(auth.userId, parsed.data.enabled))) return apiError("Turn on two-factor authentication first.", 409);
    return NextResponse.json({ enabled: parsed.data.enabled }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
