/**
 * Encrypts secret values before they are stored in MongoDB, using AES-256-GCM.
 *
 * - The key comes from VAULT_ENCRYPTION_KEY (32 random bytes, base64). It lives only in .env.local.
 *   Without it the stored values are unreadable, so back it up: if it is lost, the secrets are lost.
 * - Every value gets its own random IV, so the same secret encrypted twice looks different.
 * - GCM also protects against tampering: a changed ciphertext fails to decrypt instead of giving garbage.
 * - `context` (userId + secretId) is mixed in as "additional authenticated data". A ciphertext copied onto
 *   another secret or another user's record will therefore refuse to decrypt.
 *
 * This is server-side encryption, not end-to-end: the server holds the key and can decrypt.
 *
 * Stored format:  v1$<iv, base64>$<auth tag, base64>$<ciphertext, base64>
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12; // the recommended size for GCM

function getKey(): Buffer {
  const raw = process.env.VAULT_ENCRYPTION_KEY;
  if (!raw) throw new Error("VAULT_ENCRYPTION_KEY is not set. See .env.example.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("VAULT_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return key;
}

/** True when a usable key is configured. */
export const isVaultConfigured = (() => {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
})();

export function encryptSecret(plaintext: string, context: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join("$");
}

/** Throws if the data was tampered with, the context is wrong, or the key is different. */
export function decryptSecret(payload: string, context: string): string {
  const [version, ivB64, tagB64, dataB64, ...rest] = payload.split("$");
  if (version !== VERSION || !ivB64 || !tagB64 || dataB64 === undefined || rest.length) {
    throw new Error("Unsupported secret format.");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
