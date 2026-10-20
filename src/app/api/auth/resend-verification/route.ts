import { after, NextResponse } from "next/server";
import { findUserByEmail, isEmailVerified, normalizeEmail } from "@/db/users";
import { parseEmailOnly } from "@/lib/auth-input";
import { sendVerificationEmail } from "@/lib/email-verification";
import { isMongoConfigured } from "@/lib/mongodb";
import { clientIp, isSameOriginJson, rateLimit } from "@/lib/request-guard";

// POST /api/auth/resend-verification  { email }  ->  sends a new link if that account is waiting for one.
// The answer is the same whether or not the email has an account, so this can't be used to find out who is registered.
export async function POST(request: Request) {
  if (!isSameOriginJson(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!isMongoConfigured) return NextResponse.json({ error: "Email verification is unavailable: the database isn’t configured." }, { status: 503 });

  const parsed = parseEmailOnly(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.errors.email ?? "Enter a valid email address." }, { status: 400 });
  const email = normalizeEmail(parsed.data.email);

  // Limits are keyed by what was typed, not by whether an account exists, so they reveal nothing either.
  const tooMany = (key: string, max: number) => {
    const limit = rateLimit(key, max, 60 * 60 * 1000);
    return limit.ok ? null : NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  };
  const blocked = tooMany(`resend-ip:${clientIp(request)}`, 10) ?? tooMany(`resend-email:${email}`, 5);
  if (blocked) return blocked;

  // The lookup and the sending happen after the response, so a real unverified account and an unknown
  // email take exactly the same time to answer.
  after(async () => {
    try {
      const user = await findUserByEmail(email);
      if (user && !isEmailVerified(user)) await sendVerificationEmail(user);
    } catch (error) {
      console.error("resend-verification failed", error);
    }
  });

  return NextResponse.json({ ok: true });
}
