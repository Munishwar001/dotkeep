import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { findUserBySessionToken } from "@/db/sessions";
import { toPublicUser, type PublicUser } from "@/db/users";
import { isMongoConfigured } from "./mongodb";
import { SESSION_COOKIE } from "./session-cookie";

export { SESSION_COOKIE };

/** Cookie settings. httpOnly means page JavaScript can't read it, which blocks token theft via XSS. */
export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const, // not sent on cross-site POSTs, which blocks most CSRF
    secure: process.env.NODE_ENV === "production", // https only in production
    path: "/",
    expires: expiresAt,
  };
}

/**
 * The cookie that carries a two-step sign-in challenge: the password was right, a code is still owed. It is sent only
 * to the one route that checks the code, and it opens nothing by itself.
 */
export const TWO_FACTOR_COOKIE = "dotkeep_2fa";
export const TWO_FACTOR_COOKIE_PATH = "/api/auth/2fa";

export function twoFactorCookieOptions(expiresAt: Date) {
  return { ...sessionCookieOptions(expiresAt), path: TWO_FACTOR_COOKIE_PATH };
}

/**
 * The logged-in user for the current request, or null. Use this in Server Components.
 * cache() makes it run once per request: the sidebar, the page and the top bar all ask for the user, and without it
 * each of them would repeat the two database lookups (session, then user).
 */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  if (!isMongoConfigured) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // Prefetches render with the cookies but must not touch the database: Next prerenders them, which rejects `new Date()`
  // inside the MongoDB driver and tears the connection down ("Topology is closed"). This waits for a real request.
  await connection();
  const user = await findUserBySessionToken(token);
  return user ? toPublicUser(user) : null;
});
