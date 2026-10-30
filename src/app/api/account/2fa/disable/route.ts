import { NextResponse } from "next/server";
import { disableTwoFactor } from "@/db/two-factor";
import { parsePasswordAndCode } from "@/lib/account-input";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { limitTwoFactorChanges, requirePasswordAndCode } from "@/lib/two-factor-guard";

// POST /api/account/2fa/disable  { password, code }  ->  turns 2FA off.
// Needs the password AND a current code (or recovery code), so a stolen session can't switch it off.
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const limited = await limitTwoFactorChanges(auth.userId);
  if (limited) return limited;

  const parsed = parsePasswordAndCode(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    const user = await requirePasswordAndCode(auth.userId, parsed.data.password, parsed.data.code);
    if (user instanceof Response) return user;
    await disableTwoFactor(auth.userId);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
