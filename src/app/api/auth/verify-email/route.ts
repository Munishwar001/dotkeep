import { NextResponse } from "next/server";
import { consumeVerification } from "@/db/email-verifications";
import { markEmailVerified } from "@/db/users";
import { isMongoConfigured } from "@/lib/mongodb";
import { clientIp, isSameOriginJson, rateLimit } from "@/lib/request-guard";

// POST /api/auth/verify-email  { token }  ->  confirms the email behind a link.
// It is a POST on purpose: the link page only shows a button, because some email scanners open every link
// they find, and would otherwise use the one-time token up before the person clicks it.
export async function POST(request: Request) {
  if (!isSameOriginJson(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!isMongoConfigured) return NextResponse.json({ error: "Verification is unavailable: the database isn’t configured." }, { status: 503 });

  const limit = rateLimit(`verify:${clientIp(request)}`, 30, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const invalid = NextResponse.json({ error: "This link is invalid or has expired. Sign in to get a new one." }, { status: 400 });
  if (!token || token.length > 200) return invalid;

  try {
    const userId = await consumeVerification(token);
    if (!userId) return invalid;
    await markEmailVerified(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("verify-email failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
