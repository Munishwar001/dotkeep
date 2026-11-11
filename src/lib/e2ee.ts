/**
 * End-to-end encryption for secret values. This file runs in the BROWSER (and in Node for tests); it uses WebCrypto only.
 * The server never receives the passphrase, the recovery key or the vault key, only data that is already encrypted.
 *
 *   passphrase  --PBKDF2-SHA256-->  passphrase key  --AES-GCM-->  wraps  the vault key
 *   recovery key (256 random bits)                  --AES-GCM-->  wraps  the same vault key
 *   vault key (256 random bits)  --AES-GCM-->  encrypts each secret value (context = ownerId:secretId)
 *
 * What the server stores (VaultKeyRecord) is the two wrapped copies of the vault key and the KDF settings. Without the
 * passphrase or the recovery key, nobody, including the server, can open them. Losing both means the secrets are gone.
 *
 * Stored value format:  e1$<iv, base64>$<ciphertext + tag, base64>      (server-side encryption uses "v1$", see vault-crypto.ts)
 *
 * Keep this file free of `@/` imports: the unit tests import it directly.
 */

export const E2EE_PREFIX = "e1$";
export const PBKDF2_ITERATIONS = 600_000; // OWASP guidance for PBKDF2-HMAC-SHA256
export const MIN_PASSPHRASE_LENGTH = 12;

/** What the server keeps for a user. Every field is public-safe: it is wrapped (encrypted) or a setting. */
export type VaultKeyRecord = {
  v: 1;
  kdf: { name: "PBKDF2-SHA256"; iterations: number; salt: string };
  wrappedByPassphrase: string; // "<iv>$<ciphertext>", base64 parts
  wrappedByRecovery: string;
};

export class WrongKeyError extends Error {
  constructor(message = "That passphrase or recovery key is not correct.") {
    super(message);
    this.name = "WrongKeyError";
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

const WRAP_PASSPHRASE_AAD = encoder.encode("dotkeep:e2ee:wrap:passphrase:v1");
const WRAP_RECOVERY_AAD = encoder.encode("dotkeep:e2ee:wrap:recovery:v1");

// ---------- encoding helpers ----------

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const randomBytes = (length: number) => globalThis.crypto.getRandomValues(new Uint8Array(length));

/** A new MongoDB-style id (24 hex characters). The client picks it because the id is part of what protects the ciphertext. */
export function newObjectIdHex(): string {
  return [...randomBytes(12)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Crockford base32 (no I, L, O, U), so a recovery key is easy to read out and type.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(text: string): Uint8Array | null {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** 32 random bytes shown as 8 groups of 8 characters: XXXXXXXX-XXXXXXXX-... (52 characters of entropy-bearing text). */
const formatRecoveryKey = (bytes: Uint8Array) => encodeBase32(bytes).match(/.{1,8}/g)!.join("-");

function parseRecoveryKey(text: string): Uint8Array<ArrayBuffer> | null {
  const cleaned = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  const bytes = decodeBase32(cleaned);
  return bytes && bytes.length === 32 ? new Uint8Array(bytes) : null;
}

// ---------- key wrapping ----------

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey("raw", encoder.encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const recoveryAesKey = (raw: Uint8Array<ArrayBuffer>) => subtle().importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

async function wrap(key: CryptoKey, raw: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>): Promise<string> {
  const iv = randomBytes(12);
  const sealed = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, raw));
  return `${toBase64(iv)}$${toBase64(sealed)}`;
}

async function unwrap(key: CryptoKey, wrapped: string, aad: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const [iv, sealed] = wrapped.split("$");
  try {
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: fromBase64(iv), additionalData: aad }, key, fromBase64(sealed)));
  } catch {
    throw new WrongKeyError();
  }
}

const valueKey = (raw: Uint8Array<ArrayBuffer>) => subtle().importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

export function checkPassphrase(passphrase: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) return `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
  if (passphrase.length > 256) return "The passphrase must be at most 256 characters.";
  return null;
}

// ---------- vault lifecycle ----------

/** Makes a brand new vault key. Show `recoveryKey` to the user once; nothing else keeps it. */
export async function createVault(passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<{ vaultKey: CryptoKey; record: VaultKeyRecord; recoveryKey: string }> {
  const problem = checkPassphrase(passphrase);
  if (problem) throw new Error(problem);
  const raw = randomBytes(32) as Uint8Array<ArrayBuffer>;
  const recoveryRaw = randomBytes(32) as Uint8Array<ArrayBuffer>;
  const salt = randomBytes(16) as Uint8Array<ArrayBuffer>;
  const record: VaultKeyRecord = {
    v: 1,
    kdf: { name: "PBKDF2-SHA256", iterations, salt: toBase64(salt) },
    wrappedByPassphrase: await wrap(await passphraseKey(passphrase, salt, iterations), raw, WRAP_PASSPHRASE_AAD),
    wrappedByRecovery: await wrap(await recoveryAesKey(recoveryRaw), raw, WRAP_RECOVERY_AAD),
  };
  return { vaultKey: await valueKey(raw), record, recoveryKey: formatRecoveryKey(recoveryRaw) };
}

async function openRaw(record: VaultKeyRecord, credential: { passphrase: string } | { recoveryKey: string }): Promise<Uint8Array<ArrayBuffer>> {
  if ("passphrase" in credential) {
    const key = await passphraseKey(credential.passphrase, fromBase64(record.kdf.salt), record.kdf.iterations);
    return unwrap(key, record.wrappedByPassphrase, WRAP_PASSPHRASE_AAD);
  }
  const raw = parseRecoveryKey(credential.recoveryKey);
  if (!raw) throw new WrongKeyError("That recovery key doesn’t look right. It has 8 groups of 8 characters.");
  return unwrap(await recoveryAesKey(raw), record.wrappedByRecovery, WRAP_RECOVERY_AAD);
}

/** The vault key, ready to encrypt and decrypt values. It cannot be exported from the browser again. */
export async function unlockVault(record: VaultKeyRecord, credential: { passphrase: string } | { recoveryKey: string }): Promise<CryptoKey> {
  return valueKey(await openRaw(record, credential));
}

/**
 * A new passphrase for the same vault key. Works with the old passphrase or with the recovery key (forgot it).
 * Returns the new record; the recovery key stays the same. The server must store it in place of the old one.
 */
export async function changePassphrase(
  record: VaultKeyRecord,
  credential: { passphrase: string } | { recoveryKey: string },
  newPassphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<{ vaultKey: CryptoKey; record: VaultKeyRecord }> {
  const problem = checkPassphrase(newPassphrase);
  if (problem) throw new Error(problem);
  const raw = await openRaw(record, credential);
  const salt = randomBytes(16) as Uint8Array<ArrayBuffer>;
  const next: VaultKeyRecord = {
    ...record,
    kdf: { name: "PBKDF2-SHA256", iterations, salt: toBase64(salt) },
    wrappedByPassphrase: await wrap(await passphraseKey(newPassphrase, salt, iterations), raw, WRAP_PASSPHRASE_AAD),
  };
  return { vaultKey: await valueKey(raw), record: next };
}

// ---------- values ----------

/** `context` ties the ciphertext to its owner and its record: `${ownerId}:${secretId}`. A copy on another secret won't open. */
export async function encryptValue(vaultKey: CryptoKey, plaintext: string, context: string): Promise<string> {
  const iv = randomBytes(12);
  const sealed = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(context) }, vaultKey, encoder.encode(plaintext)));
  return `${E2EE_PREFIX}${toBase64(iv)}$${toBase64(sealed)}`;
}

export async function decryptValue(vaultKey: CryptoKey, payload: string, context: string): Promise<string> {
  const [version, iv, sealed, ...rest] = payload.split("$");
  if (`${version}$` !== E2EE_PREFIX || !iv || !sealed || rest.length) throw new Error("Unsupported secret format.");
  try {
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromBase64(iv), additionalData: encoder.encode(context) }, vaultKey, fromBase64(sealed));
    return decoder.decode(plain);
  } catch {
    throw new Error("This value couldn’t be decrypted. It may have been changed or moved.");
  }
}

export const isE2eeValue = (stored: string) => stored.startsWith(E2EE_PREFIX);

/** The shape check the server applies to what it stores (it cannot check more: it can't open the value). */
export const E2EE_VALUE_PATTERN = /^e1\$[A-Za-z0-9+/]{16}\$[A-Za-z0-9+/]+={0,2}$/;
