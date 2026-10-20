import { NextResponse } from "next/server";
import { createSession } from "@/db/sessions";
import { createUser, EmailTakenError, recordLogin, toPublicUser } from "@/db/users";
import { parseSignup } from "@/lib/auth-input";
import { deviceLabel } from "@/lib/device-label";
import { isMongoConfigured } from "@/lib/mongodb";
import { hashPassword } from "@/lib/password";
import { clientIp, isSameOriginJson, rateLimit } from "@/lib/request-guard";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

// POST /api/auth/signup  { name, email, password }  ->  creates the account and logs the user in.
export async function POST(request: Request) {
  if (!isSameOriginJson(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!isMongoConfigured) {
    return NextResponse.json({ error: "Sign-up is unavailable: the database isn’t configured." }, { status: 503 });
  }

  const limit = rateLimit(`signup:${clientIp(request)}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = parseSignup(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: Object.values(parsed.errors)[0], errors: parsed.errors }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await createUser({ name: parsed.data.name, email: parsed.data.email, passwordHash });
    const { token, expiresAt } = await createSession(user._id, deviceLabel(request.headers.get("user-agent")));
    await recordLogin(user._id); // signing up also logs the user in

    const response = NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return response;
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    console.error("signup failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
