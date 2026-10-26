import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createSession, deleteAllSessions } from "@/db/sessions";
import { createGoogleUser, EmailTakenError, findUserByEmail, findUserByGoogleId, isBlocked, isEmailVerified, linkGoogleAccount, recordLogin, type UserDoc } from "@/db/users";
import { deviceLabel } from "@/lib/device-label";
import { googleRedirectUri } from "@/lib/google-redirect";
import { fetchGoogleProfile, isGoogleConfigured, OAUTH_COOKIE, OAUTH_COOKIE_PATH, parseOAuthCookie, safeEqual } from "@/lib/google-oauth";
import { logError } from "@/lib/logger";
import { isMongoConfigured } from "@/lib/mongodb";
import { hashPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/request-guard";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

/** Redirects to the login page with a reason, and always throws away the one-time OAuth cookie. */
function fail(request: Request, code: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${code}`, request.url));
  response.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
  return response;
}

// A hash of a random password nobody knows. Google-only accounts get one so the password column is never empty.
const unusablePasswordHash = () => hashPassword(randomBytes(32).toString("base64url"));

// GET /api/auth/google/callback?code=...&state=...  ->  Google sends the browser back here after the person approved.
export async function GET(request: Request) {
  if (!isGoogleConfigured() || !isMongoConfigured) return fail(request, "google_unavailable");

  const params = new URL(request.url).searchParams;
  if (params.get("error")) return fail(request, "google_denied"); // e.g. the person pressed Cancel

  // The `state` we sent must come back unchanged, and match the cookie only this browser has. This stops
  // someone from tricking a browser into finishing a sign-in that the attacker started.
  const cookieValue = request.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${OAUTH_COOKIE}=`))?.slice(OAUTH_COOKIE.length + 1);
  const attempt = parseOAuthCookie(cookieValue);
  const state = params.get("state");
  const code = params.get("code");
  if (!attempt || !state || !code || !safeEqual(attempt.state, state)) return fail(request, "google_failed");

  try {
    const limit = await rateLimit(`google-callback:${clientIp(request)}`, 20, 10 * 60 * 1000);
    if (!limit.ok) return fail(request, "too_many");

    const profile = await fetchGoogleProfile(code, attempt.verifier, googleRedirectUri());
    // Without this, anyone could claim someone else's address on a Google account that never confirmed it.
    if (!profile.emailVerified) return fail(request, "google_unverified");

    let user: UserDoc | null = await findUserByGoogleId(profile.sub);

    if (!user) {
      const existing = await findUserByEmail(profile.email);
      if (existing) {
        if (existing.googleId && existing.googleId !== profile.sub) return fail(request, "google_failed");
        // An account that never verified its email may have been made by someone who doesn't own the address. Google
        // just proved who does, so the old password and every old session of that account stop working.
        const neverVerified = !isEmailVerified(existing);
        if (neverVerified) await deleteAllSessions(existing._id);
        await linkGoogleAccount(existing._id, profile.sub, neverVerified ? await unusablePasswordHash() : undefined);
        user = existing;
      } else {
        try {
          user = await createGoogleUser({ name: profile.name, email: profile.email, googleId: profile.sub, passwordHash: await unusablePasswordHash() });
        } catch (error) {
          if (error instanceof EmailTakenError) return fail(request, "google_failed"); // someone signed up with it a moment ago
          throw error;
        }
      }
    }

    if (isBlocked(user)) return fail(request, "blocked");

    const { token, expiresAt } = await createSession(user._id, deviceLabel(request.headers.get("user-agent")));
    await recordLogin(user._id);

    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    response.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return response;
  } catch (error) {
    await logError(error, "google sign-in failed");
    return fail(request, "google_failed");
  }
}
