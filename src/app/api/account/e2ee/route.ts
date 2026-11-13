import { NextResponse } from "next/server";
import { createVaultKeys, getVaultKeys, replacePassphraseWrap } from "@/db/vault-keys";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { parseVaultRecord } from "@/lib/e2ee-input";
import { rateLimit } from "@/lib/request-guard";

// End-to-end encryption keys. The browser makes and wraps the keys (src/lib/e2ee.ts); the server only stores them.
// The passphrase, the recovery key and the vault key itself never reach any of these routes.

// GET /api/account/e2ee  ->  { enabled, record, userId }: the wrapped keys, so the browser can unlock with the passphrase.
// The user id is part of what protects each ciphertext (see src/lib/e2ee.ts), so the browser needs it.
export async function GET(request: Request) {
  const auth = await authorize(request, { mutating: false, vault: false });
  if (auth instanceof Response) return auth;
  try {
    const record = await getVaultKeys(auth.userId);
    return NextResponse.json({ enabled: record !== null, record, userId: auth.userId.toString() }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}

async function limited(userId: string) {
  const limit = await rateLimit(`e2ee:${userId}`, 10, 15 * 60 * 1000);
  return limit.ok
    ? null
    : NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfter) } });
}

// POST /api/account/e2ee  { record }  ->  turns end-to-end encryption on. Only once: replacing the keys would lock every secret.
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true, vault: false });
  if (auth instanceof Response) return auth;

  const parsed = parseVaultRecord(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);
  const slow = await limited(auth.userId.toString()); // after the shape check, so a typo doesn't use up the tries
  if (slow) return slow;
  try {
    if (!(await createVaultKeys(auth.userId, parsed.record))) return apiError("End-to-end encryption is already on.", 409);
    return NextResponse.json({ enabled: true }, { status: 201, headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}

// PATCH /api/account/e2ee  { record }  ->  a new passphrase. Only the passphrase wrap changes; the recovery key still works.
export async function PATCH(request: Request) {
  const auth = await authorize(request, { mutating: true, vault: false });
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => null);
  const parsed = parseVaultRecord(body);
  const expectedWrap = body?.expectedWrap;
  if (typeof expectedWrap !== "string" || !expectedWrap || expectedWrap.length > 1000) return apiError("Reload your keys and try again.", 409);
  if (!parsed.ok) return apiError(parsed.error, 400);
  const slow = await limited(auth.userId.toString()); // after the shape check, so a typo doesn't use up the tries
  if (slow) return slow;
  try {
    if (!(await replacePassphraseWrap(auth.userId, parsed.record, expectedWrap))) return apiError("Your keys changed. Reload the page and try again.", 409);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
