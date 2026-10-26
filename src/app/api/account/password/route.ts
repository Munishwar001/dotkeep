import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { updatePasswordHash } from "@/db/account";
import { revokeOtherSessions } from "@/db/sessions";
import { findUserById } from "@/db/users";
import { parsePasswordChange } from "@/lib/account-input";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { hashPassword, verifyPassword } from "@/lib/password";
import { sendPasswordChangedEmail } from "@/lib/password-reset";
import { rateLimit } from "@/lib/request-guard";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// POST /api/account/password  { currentPassword, newPassword }
// Needs the current password (so a stolen session can't lock you out), then signs out every OTHER device.
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true, vault: false });
  if (auth instanceof Response) return auth;

  // Slows down someone with a stolen session trying to guess the current password.
  const limit = await rateLimit(`password:${auth.userId.toString()}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfter) } },
    );
  }

  const parsed = parsePasswordChange(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    const user = await findUserById(auth.userId);
    if (!user) return apiError("Account not found.", 404);
    // 400, not 401: the session is fine, the typed password is just wrong.
    if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) return apiError("Your current password is incorrect.", 400);

    await updatePasswordHash(auth.userId, await hashPassword(parsed.data.newPassword));
    const currentToken = (await cookies()).get(SESSION_COOKIE)?.value;
    const signedOut = await revokeOtherSessions(auth.userId, currentToken);
    after(() => sendPasswordChangedEmail(user)); // tell the owner, in case it wasn't them
    return NextResponse.json({ ok: true, signedOut }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
