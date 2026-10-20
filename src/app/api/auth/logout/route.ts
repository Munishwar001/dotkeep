import { logError } from "@/lib/logger";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { deleteSession } from "@/db/sessions";
import { isMongoConfigured } from "@/lib/mongodb";
import { isSameOriginJson } from "@/lib/request-guard";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

// POST /api/auth/logout  ->  deletes the session and clears the cookie.
export async function POST(request: Request) {
  if (!isSameOriginJson(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && isMongoConfigured) {
    try {
      await deleteSession(token);
    } catch (error) {
      await logError(error, "logout: could not delete session");
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
  return response;
}
