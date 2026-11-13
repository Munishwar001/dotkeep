/**
 * Exports come back from the server with the end-to-end secrets still encrypted (`encrypted`). These helpers open them in the
 * browser and add them to the file the server built from the readable ones, so the download holds everything.
 */
import { parseEnv, serializeEnv, type EnvEntry } from "@/lib/dotenv";
import { BACKUP_VERSION, parseJsonVariables, serializeBackup, serializeJsonVariables, type BackupProject } from "@/lib/vault-json";
import { openValue } from "./vault-key";

const byName = (a: EnvEntry, b: EnvEntry) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

/** `.env` or JSON for one project and environment. `content` is what the server built from the secrets it could read. */
export async function mergeVariables(format: "env" | "json", content: string, encrypted: { id: string; name: string; cipher: string }[]): Promise<string> {
  if (!encrypted.length) return content;
  const readable = format === "json" ? parseJsonVariables(content).entries : parseEnv(content).entries;
  const opened = await Promise.all(encrypted.map(async ({ id, name, cipher }) => ({ name, value: await openValue(id, cipher) })));
  const all = [...readable, ...opened].sort(byName);
  return format === "json" ? serializeJsonVariables(all) : serializeEnv(all);
}

export type EncryptedBackupSecret = { projectName: string; id: string; name: string; environment: string; type: string; description: string; cipher: string };

/** The whole-vault backup. `content` is the file the server built from the secrets it could read. */
export async function mergeBackup(content: string, encrypted: EncryptedBackupSecret[]): Promise<string> {
  if (!encrypted.length) return content;
  const file = JSON.parse(content) as { exportedAt: string; version: number; projects: BackupProject[] };
  if (file.version !== BACKUP_VERSION) throw new Error("The backup format changed. Reload the page and try again.");
  for (const entry of encrypted) {
    const project = file.projects.find((p) => p.name === entry.projectName);
    if (!project) continue;
    project.secrets.push({ name: entry.name, environment: entry.environment, type: entry.type, description: entry.description, value: await openValue(entry.id, entry.cipher) });
  }
  return serializeBackup(file.projects, new Date(file.exportedAt));
}
