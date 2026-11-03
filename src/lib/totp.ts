/**
 * Time-based one-time passwords (RFC 6238), the 6-digit codes an authenticator app shows. Built on node:crypto, no package.
 *
 * The app and the server share a secret. Both turn "the current 30-second step" into a code with HMAC-SHA1, so the
 * server can check a code without the app ever talking to it. SHA-1, 6 digits and 30 seconds are the defaults every
 * authenticator app (Google Authenticator, Authy, 1Password, ...) supports.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
/** A code from one step before or after now is accepted, to forgive a phone clock that is a little off. */
const WINDOW = 1;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // base32, what authenticator apps expect

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret, base32 (160 bits, the size RFC 4226 recommends). */
export const generateTotpSecret = () => base32Encode(randomBytes(20));

function codeForStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks a typed code. Returns the step it matched, or null. Pass `afterStep` (the last step already used) so a code
 * can't be used twice: someone who watched you type it over your shoulder can't replay it within its 30 seconds.
 */
export function verifyTotp(secret: string, input: string, afterStep = -1, now = Date.now()): number | null {
  const code = input.replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 1000 / STEP_SECONDS);
  let matched: number | null = null;
  // Check every step in the window without stopping early, so the time taken doesn't hint at which one was close.
  for (let step = current - WINDOW; step <= current + WINDOW; step++) {
    if (sameText(codeForStep(secret, step), code) && step > afterStep) matched = step;
  }
  return matched;
}

/** The otpauth:// link the QR code carries. Scanning it adds the account to the authenticator app. */
export function otpauthUri(secret: string, email: string): string {
  const label = encodeURIComponent(`Dotkeep:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Dotkeep&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ---- Recovery codes: the way back in when the phone is lost ----

export const RECOVERY_CODE_COUNT = 8;
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes (i, l, o, 0, 1)

/** Eight codes like "k3f9a-x7mq2". Shown to the person once; only their hashes are stored. */
export function generateRecoveryCodes(): string[] {
  const part = () => Array.from(randomBytes(5), (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join("");
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => `${part()}-${part()}`);
}

/** Case, spaces and the dash don't matter when typing one back. */
const normalizeRecovery = (code: string) => code.toLowerCase().replace(/[\s-]/g, "");

// The codes are random with ~48 bits of entropy and each works once, so a plain SHA-256 is enough (no slow hash needed).
export const hashRecoveryCode = (code: string) => createHash("sha256").update(normalizeRecovery(code)).digest("hex");

/** True if the text has the shape of a recovery code, so the caller knows to try recovery codes instead of a 6-digit code. */
export const looksLikeRecoveryCode = (input: string) => /^[a-z2-9]{10}$/.test(normalizeRecovery(input));

/** The code an app would show at `now`. The server never needs this (it only checks codes); it exists for the tests. */
export const totpCodeAt = (secret: string, now = Date.now()) => codeForStep(secret, Math.floor(now / 1000 / STEP_SECONDS));
