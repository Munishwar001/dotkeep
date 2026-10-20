/**
 * Password hashing with scrypt (built into Node, no extra package).
 *
 * Why a hash? We never store the real password. If the database ever leaks, attackers get hashes that
 * are slow and expensive to guess, not passwords. Each password gets its own random salt, so two users
 * with the same password still end up with different hashes.
 *
 * Stored format (one string, so the settings travel with the hash and can be upgraded later):
 *   scrypt$<N>$<r>$<p>$<salt, base64>$<hash, base64>
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** Longer passwords are rejected, so nobody can make the server hash a huge string. */
export const MAX_PASSWORD_LENGTH = 128;

// scrypt cost settings. These follow OWASP's guidance (N=2^15, r=8, p=3 uses about 32 MiB of memory).
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function deriveKey(password: string, salt: Buffer, options: { N: number; r: number; p: number }): Promise<Buffer> {
  // NFKC makes visually identical passwords (e.g. "é" typed two different ways) hash the same.
  const normalized = password.normalize("NFKC");
  return new Promise((resolve, reject) => {
    // node refuses to run if maxmem is too low for these settings, so derive it from them.
    const maxmem = 128 * options.N * options.r * 2;
    scrypt(normalized, salt, KEY_LENGTH, { ...options, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Turns a password into a string that is safe to store in the database. */
export async function hashPassword(password: string): Promise<string> {
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

// A real hash of a throwaway password, used when the user doesn't exist (see verifyPassword).
// It is a fixed string so the "no such user" path costs exactly as much as a real check, even on the
// very first request after the server starts.
const DUMMY_HASH =
  "scrypt$32768$8$3$h3QywecNZzSOzBNg1iZuvA==$w/TkldBe4oKhrvNQEuXkyZ2jeNkv/uEP986fzfI9BIk=";

/**
 * Checks a password against a stored hash. Never throws for bad input, it just returns false.
 *
 * Pass `null` when the user wasn't found: we still do the same amount of work, so an attacker can't
 * tell "no such email" from "wrong password" by measuring how long the answer took.
 */
export async function verifyPassword(password: string, storedHash: string | null): Promise<boolean> {
  if (storedHash === null) {
    await verifyPassword(password, DUMMY_HASH);
    return false;
  }

  if (password.length > MAX_PASSWORD_LENGTH) return false;

  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const options = { N: Number(n), r: Number(r), p: Number(p) };
  if (![options.N, options.r, options.p].every((value) => Number.isInteger(value) && value > 0)) return false;

  try {
    const expected = Buffer.from(hashB64, "base64");
    const actual = await deriveKey(password, Buffer.from(saltB64, "base64"), options);
    // timingSafeEqual avoids leaking how many bytes matched through timing.
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
