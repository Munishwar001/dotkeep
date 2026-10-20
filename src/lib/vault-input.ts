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
export function parseSecretUpdate(
  body: unknown,
): Result<{ name?: string; environment?: Environment; type?: SecretType; value?: string; projectId?: string }> {
  const input = asObject(body);
  const data: { name?: string; environment?: Environment; type?: SecretType; value?: string; projectId?: string } = {};

  if ("projectId" in input) {
    const projectId = asString(input.projectId);
    if (!projectId) return fail("Choose a project.");
    data.projectId = projectId;
  }
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

/** Ids from a bulk request: a non-empty list of strings, no longer than LIMITS.bulk. */
function checkIds(value: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string")) return fail("Choose at least one secret.");
  const ids = [...new Set(value as string[])];
  if (!ids.length) return fail("Choose at least one secret.");
  if (ids.length > LIMITS.bulk) return fail(`You can change up to ${LIMITS.bulk} secrets at once.`);
  return { ok: true, ids };
}

export type BulkAction =
  | { action: "delete"; ids: string[] }
  | { action: "update"; ids: string[]; projectId?: string; environment?: Environment; type?: SecretType };

/** Bulk edit or delete: { action: "delete", ids } or { action: "update", ids, projectId?, environment?, type? }. */
export function parseBulk(body: unknown): Result<BulkAction> {
  const input = asObject(body);
  const ids = checkIds(input.ids);
  if (!ids.ok) return ids;
  if (input.action === "delete") return { ok: true, data: { action: "delete", ids: ids.ids } };
  if (input.action !== "update") return fail("Unknown action.");

  const data: Extract<BulkAction, { action: "update" }> = { action: "update", ids: ids.ids };
  if ("projectId" in input) {
    const projectId = asString(input.projectId);
    if (!projectId) return fail("Choose a project.");
    data.projectId = projectId;
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
  return data.projectId || data.environment || data.type ? { ok: true, data } : fail("Nothing to update.");
}

const ROLES = ["editor", "viewer"] as const;
const roleOf = (value: unknown) => ROLES.find((role) => role === value);

export function parseMemberRole(body: unknown): Result<{ role: (typeof ROLES)[number] }> {
  const role = roleOf(asObject(body).role);
  return role ? { ok: true, data: { role } } : fail("Choose Editor or Viewer.");
}

export function parseMemberInvite(body: unknown): Result<{ email: string; role: (typeof ROLES)[number] }> {
  const input = asObject(body);
  const email = (asString(input.email) ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail("Enter a valid email address.");
  const role = parseMemberRole(input);
  return role.ok ? { ok: true, data: { email, role: role.data.role } } : role;
}

export function parseExport(body: unknown): Result<{ projectId: string; environment: Environment }> {
  const input = asObject(body);
  const projectId = asString(input.projectId) ?? "";
  if (!projectId) return fail("Choose a project.");
  const environment = environmentOf(input.environment);
  if (!environment) return fail("Choose an environment.");
  return { ok: true, data: { projectId, environment } };
}

export function parseImport(body: unknown): Result<{ projectId: string; environment: Environment; content: string; overwrite: boolean }> {
  const input = asObject(body);
  const exported = parseExport(input);
  if (!exported.ok) return exported;
  const content = asString(input.content) ?? "";
  if (!content.trim()) return fail("Paste or choose a .env file first.");
  if (content.length > LIMITS.importBytes) return fail(`The file is too big. The limit is ${Math.round(LIMITS.importBytes / 1000)} KB.`);
  return { ok: true, data: { ...exported.data, content, overwrite: input.overwrite === true } };
}
