/**
 * The JSON formats for import and export. This file has no imports so it can be unit tested on its own.
 *
 * Two shapes:
 *  - variables: a flat object { "NAME": "value" }, the JSON twin of a .env file (one project, one environment).
 *  - backup: the whole vault, { app: "dotkeep", version: 1, projects: [{ name, description, secrets: [...] }] },
 *    which keeps environments, types and notes so a restore recreates everything.
 * Anything that doesn't fit is reported and skipped, never guessed.
 */

export type JsonEntry = { name: string; value: string };
export type JsonVariables = { entries: JsonEntry[]; errors: { message: string }[] };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text.replace(/^﻿/, "")) };
  } catch {
    return { ok: false, error: "That isn’t valid JSON." };
  }
}

/** { "NAME": "value" }. Numbers and booleans are kept as text; anything else is reported. */
export function parseJsonVariables(text: string): JsonVariables {
  const parsed = parseJson(text);
  if (!parsed.ok) return { entries: [], errors: [{ message: parsed.error }] };
  if (!isObject(parsed.value)) return { entries: [], errors: [{ message: "Expected a JSON object like { \"NAME\": \"value\" }." }] };

  const entries: JsonEntry[] = [];
  const errors: JsonVariables["errors"] = [];
  for (const [name, raw] of Object.entries(parsed.value)) {
    const value = typeof raw === "string" ? raw : typeof raw === "number" || typeof raw === "boolean" ? String(raw) : undefined;
    if (value === undefined) errors.push({ message: `“${name}” must be a string, number or true/false.` });
    else if (!name.trim()) errors.push({ message: "A variable has an empty name." });
    else if (!value.trim()) errors.push({ message: `“${name}” has no value.` });
    else entries.push({ name, value });
  }
  return { entries, errors };
}

export function serializeJsonVariables(entries: JsonEntry[]): string {
  return JSON.stringify(Object.fromEntries(entries.map(({ name, value }) => [name, value])), null, 2) + "\n";
}

export const BACKUP_APP = "dotkeep";
export const BACKUP_VERSION = 1;

export type BackupSecret<E extends string = string, T extends string = string> = {
  name: string;
  environment: E;
  type: T;
  description: string;
  value: string;
};
export type BackupProject<E extends string = string, T extends string = string> = { name: string; description: string; secrets: BackupSecret<E, T>[] };

/** How the caller says which environments and types exist (see ENVIRONMENTS and SECRET_TYPES). */
export type BackupChecks<E extends string, T extends string> = {
  environment: (value: unknown) => E | undefined;
  type: (value: unknown) => T | undefined;
};

export type BackupParse<E extends string, T extends string> =
  | { ok: true; projects: BackupProject<E, T>[]; errors: string[] }
  | { ok: false; error: string };

export function serializeBackup(projects: BackupProject[], exportedAt: Date): string {
  return JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: exportedAt.toISOString(), projects }, null, 2) + "\n";
}

export function parseBackup<E extends string, T extends string>(text: string, check: BackupChecks<E, T>): BackupParse<E, T> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const root = parsed.value;
  if (!isObject(root) || root.app !== BACKUP_APP) return { ok: false, error: "That isn’t a Dotkeep backup file." };
  if (root.version !== BACKUP_VERSION) return { ok: false, error: `This backup is version ${String(root.version)}, which this app can’t read.` };
  if (!Array.isArray(root.projects)) return { ok: false, error: "The backup has no projects." };

  const projects: BackupProject<E, T>[] = [];
  const errors: string[] = [];
  root.projects.forEach((raw, index) => {
    const name = isObject(raw) && typeof raw.name === "string" ? raw.name.trim() : "";
    if (!isObject(raw) || !name || !Array.isArray(raw.secrets)) {
      errors.push(`Project ${index + 1} needs a name and a list of secrets.`);
      return;
    }
    const project: BackupProject<E, T> = { name, description: typeof raw.description === "string" ? raw.description.trim() : "", secrets: [] };
    raw.secrets.forEach((item, position) => {
      const where = `Project “${name}”, secret ${position + 1}`;
      if (!isObject(item)) return void errors.push(`${where}: expected an object.`);
      const secretName = typeof item.name === "string" ? item.name.trim() : "";
      if (!secretName) return void errors.push(`${where}: no name.`);
      const environment = check.environment(item.environment);
      if (!environment) return void errors.push(`${where} (“${secretName}”): unknown environment.`);
      const type = check.type(item.type);
      if (!type) return void errors.push(`${where} (“${secretName}”): unknown type.`);
      if (typeof item.value !== "string" || !item.value.trim()) return void errors.push(`${where} (“${secretName}”): no value.`);
      project.secrets.push({ name: secretName, environment, type, description: typeof item.description === "string" ? item.description.trim() : "", value: item.value });
    });
    projects.push(project);
  });
  return { ok: true, projects, errors };
}
