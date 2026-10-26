import { NextResponse } from "next/server";
import { buildAuthorizeUrl, isGoogleConfigured, newOAuthAttempt, OAUTH_COOKIE, OAUTH_COOKIE_PATH, OAUTH_COOKIE_SECONDS } from "@/lib/google-oauth";
import { googleRedirectUri } from "@/lib/google-redirect";
import { isMongoConfigured } from "@/lib/mongodb";
import { clientIp, rateLimit } from "@/lib/request-guard";
import { logError } from "@/lib/logger";

const fail = (request: Request, code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, request.url));

// GET /api/auth/google  ->  sends the browser to Google's sign-in page.
export async function GET(request: Request) {
  if (!isGoogleConfigured() || !isMongoConfigured) return fail(request, "google_unavailable");

  const ip = clientIp(request); // read before the try block: next build uses this read to treat the route as dynamic
  try {
    const limit = await rateLimit(`google-start:${ip}`, 20, 10 * 60 * 1000);
    if (!limit.ok) return fail(request, "too_many");

    const { state, verifier, cookieValue } = newOAuthAttempt();
    const response = NextResponse.redirect(buildAuthorizeUrl(state, verifier, googleRedirectUri()));
    response.cookies.set(OAUTH_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax", // Google sends the browser back with a normal link click, which lax allows
      secure: process.env.NODE_ENV === "production",
      path: OAUTH_COOKIE_PATH,
      maxAge: OAUTH_COOKIE_SECONDS,
    });
    return response;
  } catch (error) {
    await logError(error, "google sign-in could not start");
    return fail(request, "google_failed");
  }
}
