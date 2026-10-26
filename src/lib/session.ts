import { cookies } from "next/headers";
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

/** The logged-in user for the current request, or null. Use this in Server Components. */
export async function getCurrentUser(): Promise<PublicUser | null> {
  if (!isMongoConfigured) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await findUserBySessionToken(token);
  return user ? toPublicUser(user) : null;
}
