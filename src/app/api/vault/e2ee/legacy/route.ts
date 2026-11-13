import { NextResponse } from "next/server";
import { legacySecrets } from "@/db/e2ee-migration";
import { userHasE2ee } from "@/db/vault-keys";
import { apiError, authorize, handleError, noStore, requireStepUp } from "@/lib/api-guard";
import { rateLimit } from "@/lib/request-guard";

// POST /api/vault/e2ee/legacy  ->  { secrets }: the plain values of your server-encrypted secrets (and their history), so the browser
// can encrypt them end-to-end. This is a bulk export, so it has the same rules as one: step-up code, rate limit, and a log line per secret.
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;
  const stepUp = await requireStepUp(auth);
  if (stepUp) return stepUp;

  const limit = await rateLimit(`export:${auth.userId.toString()}`, 10, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfter) } });
  }

  try {
    if (!(await userHasE2ee(auth.userId))) return apiError("Turn on end-to-end encryption first.", 409);
    return NextResponse.json({ secrets: await legacySecrets(auth.userId, auth.actor) }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
