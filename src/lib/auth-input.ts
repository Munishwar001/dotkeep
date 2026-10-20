/**
 * Server-side checks for signup/login data. The forms check too, but the browser can be bypassed,
 * so the server never trusts it.
 */
import { MAX_PASSWORD_LENGTH } from "./password";

export const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type FieldErrors = { name?: string; email?: string; password?: string };
type Result<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function checkEmail(email: string): string | undefined {
  if (!email) return "Enter your email address.";
  if (email.length > MAX_EMAIL_LENGTH || !emailPattern.test(email)) return "Enter a valid email address.";
}

export function parseSignup(body: unknown): Result<{ name: string; email: string; password: string }> {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const name = text(input.name).trim();
  const email = text(input.email).trim();
  const password = text(input.password);

  const errors: FieldErrors = {};
  if (!name) errors.name = "Enter your name.";
  else if (name.length > MAX_NAME_LENGTH) errors.name = "That name is too long.";
  const emailError = checkEmail(email);
  if (emailError) errors.email = emailError;
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  else if (password.length > MAX_PASSWORD_LENGTH) errors.password = `Use at most ${MAX_PASSWORD_LENGTH} characters.`;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: { name, email, password } };
}

export function parseLogin(body: unknown): Result<{ email: string; password: string }> {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const email = text(input.email).trim();
  const password = text(input.password);

  const errors: FieldErrors = {};
  const emailError = checkEmail(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = "Enter your password.";
  else if (password.length > MAX_PASSWORD_LENGTH) errors.password = "Incorrect email or password.";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: { email, password } };
}

export function parseEmailOnly(body: unknown): Result<{ email: string }> {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const email = text(input.email).trim();
  const emailError = checkEmail(email);
  return emailError ? { ok: false, errors: { email: emailError } } : { ok: true, data: { email } };
}

export function parseReset(body: unknown): Result<{ token: string; password: string }> {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const token = text(input.token);
  const password = text(input.password);
  if (!token || token.length > 200) return { ok: false, errors: { password: "This link is invalid or has expired." } };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, errors: { password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` } };
  if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, errors: { password: `Use at most ${MAX_PASSWORD_LENGTH} characters.` } };
  return { ok: true, data: { token, password } };
}
