import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { revokeOtherSessions } from "@/db/sessions";
import { authorize, handleError, noStore } from "@/lib/api-guard";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// DELETE /api/account/sessions/others  ->  "sign out everywhere else". This device stays logged in.
export async function DELETE(request: Request) {
  const auth = await authorize(request, { mutating: true, vault: false });
  if (auth instanceof Response) return auth;

  try {
    const currentToken = (await cookies()).get(SESSION_COOKIE)?.value;
    return NextResponse.json({ signedOut: await revokeOtherSessions(auth.userId, currentToken) }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
