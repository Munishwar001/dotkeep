import { logError } from "@/lib/logger";
import { after, NextResponse } from "next/server";
import { findUserByEmail, normalizeEmail } from "@/db/users";
import { parseEmailOnly } from "@/lib/auth-input";
import { isMongoConfigured } from "@/lib/mongodb";
import { sendPasswordResetEmail } from "@/lib/password-reset";
import { clientIp, isSameOriginJson, rateLimit } from "@/lib/request-guard";

// POST /api/auth/forgot-password  { email }  ->  emails a reset link if that email has an account.
// The answer is the same whether or not the email has an account, so this can't be used to find out who is registered.
export async function POST(request: Request) {
  if (!isSameOriginJson(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!isMongoConfigured) return NextResponse.json({ error: "Password reset is unavailable: the database isn’t configured." }, { status: 503 });

  const parsed = parseEmailOnly(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.errors.email ?? "Enter a valid email address." }, { status: 400 });
  const email = normalizeEmail(parsed.data.email);

  // Limits are keyed by what was typed, not by whether an account exists, so they reveal nothing either.
  const tooMany = (key: string, max: number) => {
    const limit = rateLimit(key, max, 60 * 60 * 1000);
    return limit.ok ? null : NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  };
  const blocked = tooMany(`forgot-ip:${clientIp(request)}`, 10) ?? tooMany(`forgot-email:${email}`, 5);
  if (blocked) return blocked;

  // The lookup and the sending happen after the response, so a real account and an unknown email
  // take exactly the same time to answer.
  after(async () => {
    try {
      const user = await findUserByEmail(email);
      if (user) await sendPasswordResetEmail(user);
    } catch (error) {
      await logError(error, "forgot-password failed");
    }
  });

  return NextResponse.json({ ok: true });
}
