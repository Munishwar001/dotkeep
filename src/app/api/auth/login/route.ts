import { logError } from "@/lib/logger";
import { NextResponse } from "next/server";
import { createSession } from "@/db/sessions";
import { findUserByEmail, isBlocked, isEmailVerified, normalizeEmail, recordLogin, toPublicUser } from "@/db/users";
import { parseLogin } from "@/lib/auth-input";
import { deviceLabel } from "@/lib/device-label";
import { isMongoConfigured } from "@/lib/mongodb";
import { verifyPassword } from "@/lib/password";
import { clientIp, isSameOriginJson, rateLimit } from "@/lib/request-guard";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

const WRONG = "Incorrect email or password.";

// POST /api/auth/login  { email, password }  ->  logs the user in and sets the session cookie.
export async function POST(request: Request) {
  if (!isSameOriginJson(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!isMongoConfigured) {
    return NextResponse.json({ error: "Sign-in is unavailable: the database isn’t configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseLogin(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: Object.values(parsed.errors)[0], errors: parsed.errors }, { status: 400 });
  }

  // Slows down password guessing: 10 tries per 15 minutes for each IP + email pair.
  const limit = rateLimit(`login:${clientIp(request)}:${normalizeEmail(parsed.data.email)}`, 10, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  try {
    const user = await findUserByEmail(parsed.data.email);
    // Passing null still does the full amount of work, so "no such email" and "wrong password"
    // take the same time and give the same message.
    const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? null);
    if (!user || !valid) return NextResponse.json({ error: WRONG }, { status: 401 });

    // Only reached with the RIGHT password, so this message tells a stranger nothing about who has an account.
    if (!isEmailVerified(user)) {
      return NextResponse.json(
        { error: "Please verify your email before signing in. Check your inbox for the link.", code: "email_not_verified" },
        { status: 403 },
      );
    }

    // Also only after the right password, for the same reason.
    if (isBlocked(user)) {
      return NextResponse.json({ error: "This account has been blocked. Contact an administrator.", code: "account_blocked" }, { status: 403 });
    }

    const { token, expiresAt } = await createSession(user._id, deviceLabel(request.headers.get("user-agent")));
    await recordLogin(user._id);
    const response = NextResponse.json({ user: toPublicUser(user) });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return response;
  } catch (error) {
    await logError(error, "login failed");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
