import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession } from "@/db/sessions";
import { deleteChallenge, takeChallengeAttempt, verifySecondFactor } from "@/db/two-factor";
import { findUserById, isBlocked, recordLogin, toPublicUser } from "@/db/users";
import { parseTwoFactorCode } from "@/lib/account-input";
import { deviceLabel } from "@/lib/device-label";
import { logError } from "@/lib/logger";
import { isMongoConfigured } from "@/lib/mongodb";
import { clientIp, isSameOriginJson, rateLimit } from "@/lib/request-guard";
import { SESSION_COOKIE, sessionCookieOptions, TWO_FACTOR_COOKIE, TWO_FACTOR_COOKIE_PATH } from "@/lib/session";

/** The challenge is gone or never existed: the person has to enter the password again. */
function expired() {
  const response = NextResponse.json({ error: "Your sign-in timed out. Please sign in again.", code: "challenge_expired" }, { status: 401 });
  response.cookies.set(TWO_FACTOR_COOKIE, "", { path: TWO_FACTOR_COOKIE_PATH, maxAge: 0 });
  return response;
}

// POST /api/auth/2fa  { code }  ->  the second step of signing in. `code` is a 6-digit code or a recovery code.
// Needs the challenge cookie that login (or Google) set after the password was right.
export async function POST(request: Request) {
  if (!isSameOriginJson(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!isMongoConfigured) {
    return NextResponse.json({ error: "Sign-in is unavailable: the database isn’t configured." }, { status: 503 });
  }

  const parsed = parseTwoFactorCode(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const token = (await cookies()).get(TWO_FACTOR_COOKIE)?.value;
  if (!token) return expired();

  // The challenge itself allows only a few wrong codes. These are two more brakes across many challenges: a loose one
  // per IP (many people can share one address) and a tighter one per account, so new challenges can't be farmed.
  const tooMany = (retryAfter: number) =>
    NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  const ipLimit = await rateLimit(`2fa:ip:${clientIp(request)}`, 100, 15 * 60 * 1000);
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfter);

  try {
    const userId = await takeChallengeAttempt(token);
    if (!userId) return expired();
    const userLimit = await rateLimit(`2fa:user:${userId.toString()}`, 20, 15 * 60 * 1000);
    if (!userLimit.ok) return tooMany(userLimit.retryAfter);

    const user = await findUserById(userId);
    if (!user || !user.twoFactor || isBlocked(user)) return expired();

    if (!(await verifySecondFactor(user, parsed.data.code))) {
      return NextResponse.json({ error: "That code isn’t right. Check the code in your app and try again." }, { status: 401 });
    }

    await deleteChallenge(token);
    const { token: sessionToken, expiresAt } = await createSession(user._id, deviceLabel(request.headers.get("user-agent")));
    await recordLogin(user._id);
    const response = NextResponse.json({ user: toPublicUser(user) });
    response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(expiresAt));
    response.cookies.set(TWO_FACTOR_COOKIE, "", { path: TWO_FACTOR_COOKIE_PATH, maxAge: 0 });
    return response;
  } catch (error) {
    await logError(error, "two-factor sign-in failed");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
