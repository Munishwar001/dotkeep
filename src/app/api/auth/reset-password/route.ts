import { logError } from "@/lib/logger";
import { after, NextResponse } from "next/server";
import { updatePasswordHash } from "@/db/account";
import { cancelVerifications } from "@/db/email-verifications";
import { consumePasswordReset } from "@/db/password-resets";
import { revokeOtherSessions } from "@/db/sessions";
import { findUserById, markEmailVerified } from "@/db/users";
import { parseReset } from "@/lib/auth-input";
import { isMongoConfigured } from "@/lib/mongodb";
import { hashPassword } from "@/lib/password";
import { sendPasswordChangedEmail } from "@/lib/password-reset";
import { clientIp, isSameOriginJson, rateLimit } from "@/lib/request-guard";

// POST /api/auth/reset-password  { token, password }  ->  sets a new password using an emailed link.
// It is a POST on purpose: the link page only shows the form, so an email scanner opening the link can't use the token up.
export async function POST(request: Request) {
  if (!isSameOriginJson(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!isMongoConfigured) return NextResponse.json({ error: "Password reset is unavailable: the database isn’t configured." }, { status: 503 });

  const limit = await rateLimit(`reset:${clientIp(request)}`, 20, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  // Check the new password BEFORE using the link up, so a typo doesn't burn it.
  const parsed = parseReset(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.errors.password ?? "Invalid request." }, { status: 400 });

  try {
    const userId = await consumePasswordReset(parsed.data.token);
    if (!userId) return NextResponse.json({ error: "This link is invalid or has expired. Request a new one." }, { status: 400 });

    const user = await findUserById(userId);
    if (!user) return NextResponse.json({ error: "This link is invalid or has expired. Request a new one." }, { status: 400 });

    await updatePasswordHash(userId, await hashPassword(parsed.data.password));
    // Getting the link proves the person controls this inbox, which is exactly what email verification checks.
    await markEmailVerified(userId);
    await cancelVerifications(userId); // a pending "verify your email" link is no longer needed
    // Whoever was logged in with the old password (maybe the person who needed the reset) is signed out everywhere.
    await revokeOtherSessions(userId, undefined);

    after(() => sendPasswordChangedEmail(user));
    return NextResponse.json({ ok: true });
  } catch (error) {
    await logError(error, "reset-password failed");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
