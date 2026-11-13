/**
 * Import and export of a project's secrets (.env or JSON) for one environment.
 * Import adds each variable as an "Environment variable" secret, going through createSecret/updateSecret
 * so encryption, limits, version history and the audit log all work as usual. importEntries() is the shared
 * core: the whole-vault backup (vault-backup.ts) uses it too, with entries that carry their own environment.
 */
import type { ObjectId } from "mongodb";
import { isE2eeValue } from "@/lib/e2ee";
import { decryptSecret } from "@/lib/vault-crypto";
import { ENV_NAME, type EnvEntry } from "@/lib/dotenv";
import { LIMITS, type Environment, type SecretType } from "@/modules/vault/constants";
import type { Actor } from "./access";
import { collections, keyOf } from "./collections";
import { E2eeError, LimitError, NameTakenError } from "./errors";
import { logEvents } from "./secret-events";
import { contextOf, createSecret, eventOf, updateSecret, type Patch } from "./secrets";

export type ImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: { name: string; error: string }[];
};

/** `type` and `description` are left alone on an existing secret when they are undefined. */
export type ImportEntry = { name: string; value: string; environment: Environment; type?: SecretType; description?: string };

export const emptyResult = (): ImportResult => ({ created: 0, updated: 0, unchanged: 0, skipped: 0, failed: [] });

/** Adds to a project. `source` reads after "from", e.g. "a .env file". Returns null when the project is gone. */
export async function importEntries(
  userId: ObjectId,
  actor: Actor,
  projectId: ObjectId,
  entries: ImportEntry[],
  options: { overwrite: boolean; source: string },
): Promise<ImportResult | null> {
  const { projects, secrets } = await collections();
  if (!(await projects.findOne({ _id: projectId, userId }, { projection: { _id: 1 } }))) return null;

  const existing = await secrets.find({ userId, projectId, nameKey: { $in: entries.map((e) => keyOf(e.name)) } }).toArray();
  const slot = (environment: string, nameKey: string) => `${environment}:${nameKey}`;
  const bySlot = new Map(existing.map((doc) => [slot(doc.environment, doc.nameKey), doc]));

  const result = emptyResult();
  for (const { name, value, environment, type, description } of entries) {
    if (name.length > LIMITS.secretName) {
      result.failed.push({ name, error: `The name must be at most ${LIMITS.secretName} characters.` });
      continue;
    }
    if (value.length > LIMITS.secretValue) {
      result.failed.push({ name, error: `The value must be at most ${LIMITS.secretValue.toLocaleString("en")} characters.` });
      continue;
    }
    if (description !== undefined && description.length > LIMITS.secretDescription) {
      result.failed.push({ name, error: `The notes must be at most ${LIMITS.secretDescription} characters.` });
      continue;
    }

    try {
      const current = bySlot.get(slot(environment, keyOf(name)));
      if (!current) {
        const secret = await createSecret(userId, actor, { projectId, name, environment, type: type ?? "env_variable", value, description }, { action: "imported", detail: `from ${options.source}` });
        if (!secret) return null; // the project was deleted while importing
        result.created += 1;
      } else if (!options.overwrite) {
        result.skipped += 1;
      } else if (isE2eeValue(current.valueEncrypted)) {
        result.failed.push({ name, error: "This secret is end-to-end encrypted, so an import can’t overwrite it." });
      } else {
        const patch: Patch = {};
        if (decryptSecret(current.valueEncrypted, contextOf(userId, current._id)) !== value) patch.value = value; // the same value gets no new version
        if (type && type !== current.type) patch.type = type;
        if (description !== undefined && description !== (current.description ?? "")) patch.description = description;
        if (!Object.keys(patch).length) {
          result.unchanged += 1;
        } else {
          await updateSecret(userId, actor, current._id, patch, { detail: `overwritten by an import from ${options.source}` });
          result.updated += 1;
        }
      }
    } catch (error) {
      if (error instanceof LimitError) {
        result.failed.push({ name, error: error.message });
        break; // every further one would fail the same way
      }
      if (error instanceof E2eeError) {
        // Importing a file means the server would see the values, which an end-to-end account doesn't allow.
        result.failed.push({ name, error: "Your account uses end-to-end encryption, so importing from a file isn’t available yet." });
        break; // every further one would fail the same way
      }
      if (error instanceof NameTakenError) result.failed.push({ name, error: error.message });
      else throw error;
    }
  }
  return result;
}

/** Returns null when the project doesn't exist (or isn't yours). `source` is the file kind, e.g. "a .env file". */
export async function importSecrets(
  userId: ObjectId,
  actor: Actor,
  input: { projectId: ObjectId; environment: Environment; entries: EnvEntry[]; overwrite: boolean; source: string },
): Promise<ImportResult | null> {
  const entries = input.entries.map(({ name, value }) => ({ name, value, environment: input.environment }));
  return importEntries(userId, actor, input.projectId, entries, { overwrite: input.overwrite, source: input.source });
}

/** An end-to-end secret on its way out: still encrypted, the browser opens it with the vault key. */
export type EncryptedExport = { id: string; name: string; cipher: string };

/**
 * Decrypts every secret of a project in one environment, for a download. Null when the project isn't yours.
 * End-to-end secrets can't be opened here, so they come back separately as `encrypted`.
 * `envNamesOnly` leaves out names that can't be a variable name (a .env file can't hold them; JSON can).
 */
export async function exportSecrets(
  userId: ObjectId,
  actor: Actor,
  input: { projectId: ObjectId; environment: Environment; envNamesOnly: boolean; destination: string },
): Promise<{ entries: EnvEntry[]; encrypted: EncryptedExport[]; skipped: string[]; projectName: string } | null> {
  const { projects, secrets } = await collections();
  const project = await projects.findOne({ _id: input.projectId, userId }, { projection: { name: 1 } });
  if (!project) return null;

  const docs = await secrets.find({ userId, projectId: input.projectId, environment: input.environment }).sort({ nameKey: 1 }).toArray();
  const entries: EnvEntry[] = [];
  const encrypted: EncryptedExport[] = [];
  const skipped: string[] = [];
  const exported = [];
  for (const doc of docs) {
    if (input.envNamesOnly && !ENV_NAME.test(doc.name)) {
      skipped.push(doc.name); // e.g. a name with spaces can't be a variable name
      continue;
    }
    if (isE2eeValue(doc.valueEncrypted)) encrypted.push({ id: doc._id.toString(), name: doc.name, cipher: doc.valueEncrypted });
    else entries.push({ name: doc.name, value: decryptSecret(doc.valueEncrypted, contextOf(userId, doc._id)) });
    exported.push(eventOf(doc, actor, "exported", `to ${input.destination}`));
  }
  await logEvents(userId, exported);
  return { entries, encrypted, skipped, projectName: project.name };
}
