import { NextResponse } from "next/server";
import { createSession } from "@/db/sessions";
import { findUserByEmail, normalizeEmail, recordLogin, toPublicUser } from "@/db/users";
import { parseLogin } from "@/lib/auth-input";
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

    const { token, expiresAt } = await createSession(user._id);
    await recordLogin(user._id);
    const response = NextResponse.json({ user: toPublicUser(user) });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return response;
  } catch (error) {
    console.error("login failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
