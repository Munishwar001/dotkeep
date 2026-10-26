/**
 * .env import and export for one project and one environment.
 * Import adds each variable as an "Environment variable" secret, going through createSecret/updateSecret
 * so encryption, limits, version history and the audit log all work as usual.
 */
import type { ObjectId } from "mongodb";
import { decryptSecret } from "@/lib/vault-crypto";
import { ENV_NAME, type EnvEntry } from "@/lib/dotenv";
import { LIMITS, type Environment } from "@/modules/vault/constants";
import type { Actor } from "./access";
import { collections, keyOf } from "./collections";
import { LimitError, NameTakenError } from "./errors";
import { logEvents } from "./secret-events";
import { contextOf, createSecret, eventOf, updateSecret } from "./secrets";

export type ImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: { name: string; error: string }[];
};

/** Returns null when the project doesn't exist (or isn't yours). */
export async function importSecrets(
  userId: ObjectId,
  actor: Actor,
  input: { projectId: ObjectId; environment: Environment; entries: EnvEntry[]; overwrite: boolean },
): Promise<ImportResult | null> {
  const { projects, secrets } = await collections();
  if (!(await projects.findOne({ _id: input.projectId, userId }, { projection: { _id: 1 } }))) return null;

  const existing = await secrets
    .find({ userId, projectId: input.projectId, environment: input.environment, nameKey: { $in: input.entries.map((e) => keyOf(e.name)) } })
    .toArray();
  const byKey = new Map(existing.map((doc) => [doc.nameKey, doc]));

  const result: ImportResult = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: [] };
  for (const { name, value } of input.entries) {
    if (name.length > LIMITS.secretName) {
      result.failed.push({ name, error: `The name must be at most ${LIMITS.secretName} characters.` });
      continue;
    }
    if (value.length > LIMITS.secretValue) {
      result.failed.push({ name, error: `The value must be at most ${LIMITS.secretValue.toLocaleString("en")} characters.` });
      continue;
    }

    try {
      const current = byKey.get(keyOf(name));
      if (!current) {
        const secret = await createSecret(userId, actor, { projectId: input.projectId, name, environment: input.environment, type: "env_variable", value }, { action: "imported", detail: "from a .env file" });
        if (!secret) return null; // the project was deleted while importing
        result.created += 1;
      } else if (!input.overwrite) {
        result.skipped += 1;
      } else if (decryptSecret(current.valueEncrypted, contextOf(userId, current._id)) === value) {
        result.unchanged += 1; // no point in a new version for the same value
      } else {
        await updateSecret(userId, actor, current._id, { value }, { detail: "overwritten by a .env import" });
        result.updated += 1;
      }
    } catch (error) {
      if (error instanceof LimitError) {
        result.failed.push({ name, error: error.message });
        break; // every further one would fail the same way
      }
      if (error instanceof NameTakenError) result.failed.push({ name, error: error.message });
      else throw error;
    }
  }
  return result;
}

/** Decrypts every secret of a project in one environment, for a .env download. Null when the project isn't yours. */
export async function exportSecrets(
  userId: ObjectId,
  actor: Actor,
  input: { projectId: ObjectId; environment: Environment },
): Promise<{ entries: EnvEntry[]; skipped: string[]; projectName: string } | null> {
  const { projects, secrets } = await collections();
  const project = await projects.findOne({ _id: input.projectId, userId }, { projection: { name: 1 } });
  if (!project) return null;

  const docs = await secrets.find({ userId, projectId: input.projectId, environment: input.environment }).sort({ nameKey: 1 }).toArray();
  const entries: EnvEntry[] = [];
  const skipped: string[] = [];
  const exported = [];
  for (const doc of docs) {
    if (!ENV_NAME.test(doc.name)) {
      skipped.push(doc.name); // e.g. a name with spaces can't be a variable name
      continue;
    }
    entries.push({ name: doc.name, value: decryptSecret(doc.valueEncrypted, contextOf(userId, doc._id)) });
    exported.push(eventOf(doc, actor, "exported", "to a .env file"));
  }
  await logEvents(userId, exported);
  return { entries, skipped, projectName: project.name };
}
