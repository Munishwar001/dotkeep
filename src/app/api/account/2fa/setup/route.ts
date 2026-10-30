import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { startTwoFactorSetup } from "@/db/two-factor";
import { parsePasswordOnly } from "@/lib/account-input";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { limitTwoFactorChanges, requirePassword } from "@/lib/two-factor-guard";
import { otpauthUri } from "@/lib/totp";

// POST /api/account/2fa/setup  { password }  ->  { secret, qr }
// Starts turning 2FA on. Nothing is active until /enable gets a correct code, so abandoning here changes nothing.
// The vault key also encrypts the 2FA secret, so this needs it (authorize's default).
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const limited = await limitTwoFactorChanges(auth.userId);
  if (limited) return limited;

  const parsed = parsePasswordOnly(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    const user = await requirePassword(auth.userId, parsed.data.password);
    if (user instanceof Response) return user;

    const secret = await startTwoFactorSetup(auth.userId);
    if (!secret) return apiError("Two-factor authentication is already turned on.", 409);
    const qr = await QRCode.toDataURL(otpauthUri(secret, user.email), { margin: 1, width: 192 });
    return NextResponse.json({ secret, qr }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
