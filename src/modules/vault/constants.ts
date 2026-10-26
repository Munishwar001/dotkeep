/** Shared by the server (validation) and the browser (forms, filters). Keep this file free of server-only imports. */

export const ENVIRONMENTS = [
  { value: "local", label: "Local" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
] as const;

export const SECRET_TYPES = [
  { value: "api_key", label: "API key" },
  { value: "access_token", label: "Access token" },
  { value: "webhook_url", label: "Webhook URL" },
  { value: "database_url", label: "Database URL" },
  { value: "env_variable", label: "Environment variable" },
  { value: "other", label: "Other" },
] as const;

export type Environment = (typeof ENVIRONMENTS)[number]["value"];
export type SecretType = (typeof SECRET_TYPES)[number]["value"];

export const LIMITS = {
  projects: 100, // per user
  secrets: 1000, // per user
  projectName: 60,
  projectDescription: 280,
  secretName: 80,
  secretValue: 10_000,
  versions: 20, // old values kept per secret
  bulk: 200, // secrets in one bulk edit or delete
  importEntries: 500, // variables in one .env import
  importBytes: 200_000, // size of one .env import
} as const;

export const ROLE_LABELS = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;

/** The audit log's labels. */
export const AUDIT_LABELS = {
  created: "Created",
  revealed: "Viewed",
  updated: "Edited",
  value_changed: "Value changed",
  moved: "Moved",
  restored: "Restored old value",
  imported: "Imported from .env",
  exported: "Exported to .env",
  deleted: "Deleted",
} as const;

/** A revealed value hides itself again after this many seconds. Users can pick another one in Settings. */
export const REVEAL_SECONDS = 15;
export const REVEAL_OPTIONS = [5, 15, 30, 60] as const;

export const environmentLabel = (value: string) => ENVIRONMENTS.find((e) => e.value === value)?.label ?? value;
export const secretTypeLabel = (value: string) => SECRET_TYPES.find((t) => t.value === value)?.label ?? value;
