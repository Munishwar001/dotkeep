/** Shared by the Settings routes that change 2FA: they all ask for the password, and some also for a current code. */
import type { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { verifySecondFactor } from "@/db/two-factor";
import { findUserById, type UserDoc } from "@/db/users";
import { apiError, noStore } from "./api-guard";
import { verifyPassword } from "./password";
import { rateLimit } from "./request-guard";

/** Same counter for every route below, so switching routes doesn't give extra guesses. 10 tries per 15 minutes. */
export async function limitTwoFactorChanges(userId: ObjectId): Promise<Response | null> {
  const limit = await rateLimit(`2fa-settings:${userId.toString()}`, 10, 15 * 60 * 1000);
  if (limit.ok) return null;
  return NextResponse.json(
    { error: "Too many attempts. Wait a few minutes and try again." },
    { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfter) } },
  );
}

/** Loads the user and checks the password, so a stolen session alone can't change 2FA. Returns the user, or an error Response. */
export async function requirePassword(userId: ObjectId, password: string): Promise<UserDoc | Response> {
  const user = await findUserById(userId);
  if (!user) return apiError("Account not found.", 404);
  // 400, not 401: the session is fine, the typed password is just wrong.
  if (!(await verifyPassword(password, user.passwordHash))) return apiError("Your password is incorrect.", 400);
  return user;
}

/** Like requirePassword, and also a valid authenticator or recovery code (needed to turn 2FA off or to get new recovery codes). */
export async function requirePasswordAndCode(userId: ObjectId, password: string, code: string): Promise<UserDoc | Response> {
  const user = await requirePassword(userId, password);
  if (user instanceof Response) return user;
  if (!user.twoFactor) return apiError("Two-factor authentication isn’t turned on.", 409);
  if (!(await verifySecondFactor(user, code))) return apiError("That code isn’t right.", 400);
  return user;
}
