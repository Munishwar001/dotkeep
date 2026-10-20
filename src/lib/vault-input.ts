/** Server-side checks for project and secret data. The forms check too, but the server never trusts the browser. */
import { ENVIRONMENTS, LIMITS, SECRET_TYPES, type Environment, type SecretType } from "@/modules/vault/constants";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const asObject = (body: unknown) => (typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {});
const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

function checkName(label: string, value: unknown, max: number): { ok: true; name: string } | { ok: false; error: string } {
  const name = asString(value)?.trim() ?? "";
  if (!name) return fail(`Enter a ${label} name.`);
  if (name.length > max) return fail(`The ${label} name must be at most ${max} characters.`);
  return { ok: true, name };
}

const environmentOf = (value: unknown) => ENVIRONMENTS.find((e) => e.value === value)?.value as Environment | undefined;
const typeOf = (value: unknown) => SECRET_TYPES.find((t) => t.value === value)?.value as SecretType | undefined;

function checkValue(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const text = asString(value);
  if (text === undefined || !text.trim()) return fail("Enter the secret value.");
  if (text.length > LIMITS.secretValue) return fail(`The value must be at most ${LIMITS.secretValue.toLocaleString("en")} characters.`);
  return { ok: true, value: text }; // not trimmed: a secret may legitimately contain spaces or newlines
}

export function parseProject(body: unknown): Result<{ name: string; description: string }> {
  const input = asObject(body);
  const name = checkName("project", input.name, LIMITS.projectName);
  if (!name.ok) return name;
  const description = (asString(input.description) ?? "").trim();
  if (description.length > LIMITS.projectDescription) {
    return fail(`The description must be at most ${LIMITS.projectDescription} characters.`);
  }
  return { ok: true, data: { name: name.name, description } };
}

export function parseSecretCreate(body: unknown): Result<{
  projectId: string;
  name: string;
  environment: Environment;
  type: SecretType;
  value: string;
}> {
  const input = asObject(body);
  const projectId = asString(input.projectId) ?? "";
  if (!projectId) return fail("Choose a project.");
  const name = checkName("secret", input.name, LIMITS.secretName);
  if (!name.ok) return name;
  const environment = environmentOf(input.environment);
  if (!environment) return fail("Choose an environment.");
  const type = typeOf(input.type);
  if (!type) return fail("Choose a type.");
  const value = checkValue(input.value);
  if (!value.ok) return value;
  return { ok: true, data: { projectId, name: name.name, environment, type, value: value.value } };
}

/** Only the fields that are present are changed. Leave `value` out to keep the stored value. */
export function parseSecretUpdate(body: unknown): Result<{ name?: string; environment?: Environment; type?: SecretType; value?: string }> {
  const input = asObject(body);
  const data: { name?: string; environment?: Environment; type?: SecretType; value?: string } = {};

  if ("name" in input) {
    const name = checkName("secret", input.name, LIMITS.secretName);
    if (!name.ok) return name;
    data.name = name.name;
  }
  if ("environment" in input) {
    const environment = environmentOf(input.environment);
    if (!environment) return fail("Choose an environment.");
    data.environment = environment;
  }
  if ("type" in input) {
    const type = typeOf(input.type);
    if (!type) return fail("Choose a type.");
    data.type = type;
  }
  if ("value" in input) {
    const value = checkValue(input.value);
    if (!value.ok) return value;
    data.value = value.value;
  }
  return Object.keys(data).length ? { ok: true, data } : fail("Nothing to update.");
}
