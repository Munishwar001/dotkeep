import { NextResponse } from "next/server";
import { regenerateRecoveryCodes } from "@/db/two-factor";
import { parsePasswordAndCode } from "@/lib/account-input";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { sendTwoFactorChangedEmail } from "@/lib/two-factor-email";
import { limitTwoFactorChanges, requirePasswordAndCode } from "@/lib/two-factor-guard";

// POST /api/account/2fa/recovery-codes  { password, code }  ->  { recoveryCodes }
// Makes a new set and invalidates the old one. Same proof as turning 2FA off.
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
    const recoveryCodes = await regenerateRecoveryCodes(auth.userId);
    await sendTwoFactorChangedEmail(user, "recovery-codes");
    return NextResponse.json({ recoveryCodes }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
