/**
 * "Continue with Google": the OAuth 2.0 authorization-code flow with PKCE, written with plain fetch (no extra package).
 *
 *   1. /api/auth/google          sends the browser to Google with a random `state` and a PKCE challenge
 *   2. Google asks the person to approve, then sends the browser back to /api/auth/google/callback?code=...
 *   3. the callback trades the code for an access token (server to server, with our client secret),
 *      asks Google who the person is, and logs them in
 *
 * Settings (.env.local): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. See .env.example.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** Short-lived cookie that carries `state` + PKCE verifier from the start of the flow to the callback. */
export const OAUTH_COOKIE = "dotkeep_oauth";
export const OAUTH_COOKIE_PATH = "/api/auth/google";
export const OAUTH_COOKIE_SECONDS = 10 * 60;

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

const base64url = (buffer: Buffer) => buffer.toString("base64url");

/** Fresh random values for one sign-in attempt. */
export function newOAuthAttempt() {
  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(48));
  return { state, verifier, cookieValue: `${state}.${verifier}` };
}

/** Reads back what newOAuthAttempt() stored in the cookie. Returns null if the cookie is missing or malformed. */
export function parseOAuthCookie(value: string | undefined): { state: string; verifier: string } | null {
  if (!value) return null;
  const [state, verifier, ...rest] = value.split(".");
  if (!state || !verifier || rest.length > 0) return null;
  return { state, verifier };
}

/** Constant-time string comparison, so the `state` check can't be guessed byte by byte. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function buildAuthorizeUrl(state: string, verifier: string, redirectUri: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: base64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export type GoogleProfile = { sub: string; email: string; emailVerified: boolean; name: string };

/** Trades the one-time `code` for the person's Google profile. Throws if anything about it is wrong. */
export async function fetchGoogleProfile(code: string, verifier: string, redirectUri: string): Promise<GoogleProfile> {
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenResponse.ok) throw new Error(`Google token request failed (${tokenResponse.status})`);
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
  if (!accessToken) throw new Error("Google sent no access token");

  const infoResponse = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
  if (!infoResponse.ok) throw new Error(`Google userinfo request failed (${infoResponse.status})`);
  const info = (await infoResponse.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!info.sub || !info.email) throw new Error("Google profile has no id or email");

  return { sub: info.sub, email: info.email, emailVerified: info.email_verified === true, name: info.name?.trim() || info.email.split("@")[0] };
}
