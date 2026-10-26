/** Server-side checks for Settings. The forms check too, but the server never trusts the browser. */
import { MIN_PASSWORD_LENGTH } from "./auth-input";
import { MAX_PASSWORD_LENGTH } from "./password";
import { REVEAL_OPTIONS } from "@/modules/vault/constants";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const asObject = (body: unknown) => (typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {});
const text = (value: unknown) => (typeof value === "string" ? value : "");

export function parseProfile(body: unknown): Result<{ name: string }> {
  const name = text(asObject(body).name).trim();
  if (!name) return fail("Enter your name.");
  if (name.length > 100) return fail("That name is too long.");
  return { ok: true, data: { name } };
}

export function parsePasswordChange(body: unknown): Result<{ currentPassword: string; newPassword: string }> {
  const input = asObject(body);
  const currentPassword = text(input.currentPassword);
  const newPassword = text(input.newPassword);
  if (!currentPassword) return fail("Enter your current password.");
  if (newPassword.length < MIN_PASSWORD_LENGTH) return fail(`Use at least ${MIN_PASSWORD_LENGTH} characters for the new password.`);
  if (newPassword.length > MAX_PASSWORD_LENGTH) return fail(`Use at most ${MAX_PASSWORD_LENGTH} characters for the new password.`);
  if (newPassword === currentPassword) return fail("The new password must be different from the current one.");
  return { ok: true, data: { currentPassword, newPassword } };
}

export function parsePreferences(body: unknown): Result<{ revealSeconds: number }> {
  const seconds = asObject(body).revealSeconds;
  if (typeof seconds !== "number" || !(REVEAL_OPTIONS as readonly number[]).includes(seconds)) {
    return fail(`Choose one of: ${REVEAL_OPTIONS.join(", ")} seconds.`);
  }
  return { ok: true, data: { revealSeconds: seconds } };
}

export function parsePasswordOnly(body: unknown): Result<{ password: string }> {
  const password = text(asObject(body).password);
  if (!password) return fail("Enter your password to confirm.");
  return { ok: true, data: { password } };
}
