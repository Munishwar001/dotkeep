import { NextResponse } from "next/server";
import { deleteAccount } from "@/db/account";
import { findUserById } from "@/db/users";
import { parsePasswordOnly } from "@/lib/account-input";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/request-guard";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

// DELETE /api/account  { password }  ->  permanently deletes your account, projects, secrets and sessions.
export async function DELETE(request: Request) {
  const auth = await authorize(request, { mutating: true, vault: false });
  if (auth instanceof Response) return auth;

  // Shares its counter with the password-change route: both let you guess the password.
  const limit = rateLimit(`password:${auth.userId.toString()}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfter) } },
    );
  }

  const parsed = parsePasswordOnly(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    const user = await findUserById(auth.userId);
    if (!user) return apiError("Account not found.", 404);
    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return apiError("That password is incorrect.", 400);

    const result = await deleteAccount(auth.userId);
    if (!result.ok) {
      return result.reason === "last-admin"
        ? apiError("You are the only admin. Make someone else an admin first (npm run make-admin), then delete this account.", 409)
        : apiError("Account not found.", 404);
    }

    const response = NextResponse.json({ ok: true }, { headers: noStore });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
    return response;
  } catch (error) {
    return handleError(error);
  }
}
