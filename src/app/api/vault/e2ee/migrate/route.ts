import { NextResponse } from "next/server";
import { parseObjectId } from "@/db/collections";
import { migrateSecrets, type MigrationItem } from "@/db/e2ee-migration";
import { userHasE2ee } from "@/db/vault-keys";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { E2EE_VALUE_PATTERN } from "@/lib/e2ee";

import { rateLimit } from "@/lib/request-guard";

const BATCH = 50;
const MAX_VERSIONS = 20;
const MAX_CIPHER = 70_000;

const isCipher = (value: unknown): value is string => typeof value === "string" && value.length < MAX_CIPHER && E2EE_VALUE_PATTERN.test(value);

function parseItems(body: unknown): MigrationItem[] | null {
  const items = typeof body === "object" && body !== null ? (body as { items?: unknown }).items : null;
  if (!Array.isArray(items) || !items.length || items.length > BATCH) return null;
  const parsed: MigrationItem[] = [];
  for (const item of items) {
    const { id, cipher, versions } = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const secretId = typeof id === "string" ? parseObjectId(id) : null;
    if (!secretId || !isCipher(cipher) || !Array.isArray(versions) || versions.length > MAX_VERSIONS) return null;
    const list: MigrationItem["versions"] = [];
    for (const version of versions) {
      const { id: versionId, cipher: versionCipher } = (typeof version === "object" && version !== null ? version : {}) as Record<string, unknown>;
      const parsedId = typeof versionId === "string" ? parseObjectId(versionId) : null;
      if (!parsedId || !isCipher(versionCipher)) return null;
      list.push({ id: parsedId, cipher: versionCipher });
    }
    parsed.push({ id: secretId, cipher, versions: list });
  }
  return parsed;
}

// POST /api/vault/e2ee/migrate  { items: [{ id, cipher, versions: [{ id, cipher }] }] }  ->  { migrated, failed }
// Replaces server-encrypted values (and their history) with ciphertext the browser made. Up to 50 secrets per request.
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  try {
    const limit = await rateLimit(`e2ee-migrate:${auth.userId}`, 30, 15 * 60 * 1000);
    if (!limit.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfter) } });

    const items = parseItems(await request.json().catch(() => null));
    if (!items) return apiError("That request isn’t valid.", 400);

    if (!(await userHasE2ee(auth.userId))) return apiError("Turn on end-to-end encryption first.", 409);
    return NextResponse.json(await migrateSecrets(auth.userId, auth.actor, items), { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
