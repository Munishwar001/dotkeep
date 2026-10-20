import { NextResponse } from "next/server";
import { createUser, EmailTakenError, toPublicUser } from "@/db/users";
import { parseSignup } from "@/lib/auth-input";
import { sendVerificationEmail } from "@/lib/email-verification";
import { isMongoConfigured } from "@/lib/mongodb";
import { hashPassword } from "@/lib/password";
import { clientIp, isSameOriginJson, rateLimit } from "@/lib/request-guard";

// POST /api/auth/signup  { name, email, password }  ->  creates the account and emails a verification link.
// It does NOT log the user in: no session and no cookie. The email must be verified before the first sign-in.
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
    // If the email couldn't be sent the account still exists; the login page lets the person ask for a new link.
    const sent = await sendVerificationEmail(user);
    return NextResponse.json({ user: toPublicUser(user), emailSent: sent === "sent" }, { status: 201 });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    console.error("signup failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
