/** Server-side shape checks for the end-to-end key record. The server can't check what is inside the wrapped keys, only that they look right. */
import type { VaultKeyRecord } from "./e2ee";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** Wrapped key = 12-byte IV (16 chars) + "$" + 32-byte key + 16-byte tag (64 chars). */
const WRAPPED = /^[A-Za-z0-9+/]{16}\$[A-Za-z0-9+/]{64}$/;

export const MIN_KDF_ITERATIONS = 200_000;
export const MAX_KDF_ITERATIONS = 5_000_000;

export function parseVaultRecord(body: unknown): { ok: true; record: VaultKeyRecord } | { ok: false; error: string } {
  const bad = { ok: false as const, error: "That key record isn’t valid." };
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>).record : undefined;
  if (typeof input !== "object" || input === null) return bad;
  const { v, kdf, wrappedByPassphrase, wrappedByRecovery } = input as Record<string, unknown>;
  if (v !== 1 || typeof kdf !== "object" || kdf === null) return bad;
  const { name, iterations, salt } = kdf as Record<string, unknown>;
  if (name !== "PBKDF2-SHA256") return bad;
  if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < MIN_KDF_ITERATIONS || iterations > MAX_KDF_ITERATIONS) return bad;
  if (typeof salt !== "string" || salt.length !== 24 || !BASE64.test(salt)) return bad; // 16 bytes
  if (typeof wrappedByPassphrase !== "string" || !WRAPPED.test(wrappedByPassphrase)) return bad;
  if (typeof wrappedByRecovery !== "string" || !WRAPPED.test(wrappedByRecovery)) return bad;
  return { ok: true, record: { v: 1, kdf: { name: "PBKDF2-SHA256", iterations, salt }, wrappedByPassphrase, wrappedByRecovery } };
}
