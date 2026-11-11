/**
 * Whole-vault backup: every project you OWN with all of its secrets, decrypted into one JSON file, and the way back.
 * Projects shared with you are not included: they belong to someone else, who can back them up themselves.
 *
 * A restore matches projects by name. A missing project is created, an existing one gets the secrets added
 * (same name + environment: skipped, or replaced when `overwrite` is on), all through importEntries().
 */
import { ObjectId } from "mongodb";
import { isE2eeValue } from "@/lib/e2ee";
import { decryptSecret } from "@/lib/vault-crypto";
import type { BackupProject } from "@/lib/vault-json";
import { LIMITS, type Environment, type SecretType } from "@/modules/vault/constants";
import type { Actor } from "./access";
import { collections, keyOf } from "./collections";
import { LimitError, NameTakenError } from "./errors";
import { createProject } from "./projects";
import { emptyResult, importEntries, type ImportResult } from "./secret-import";
import { logEvents } from "./secret-events";
import { contextOf, eventOf } from "./secrets";

/** An end-to-end secret in a backup: still encrypted, the browser opens it and puts it into its project in the file. */
export type EncryptedBackupSecret = { projectName: string; id: string; name: string; environment: Environment; type: SecretType; description: string; cipher: string };

export async function exportBackup(userId: ObjectId, actor: Actor): Promise<{ projects: BackupProject[]; encrypted: EncryptedBackupSecret[]; secretCount: number }> {
  const { projects, secrets } = await collections();
  const [projectDocs, secretDocs] = await Promise.all([
    projects.find({ userId }).sort({ nameKey: 1 }).toArray(),
    secrets.find({ userId }).sort({ nameKey: 1, environment: 1 }).toArray(),
  ]);

  const byProject = new Map(projectDocs.map((doc): [string, BackupProject] => [doc._id.toString(), { name: doc.name, description: doc.description, secrets: [] }]));
  const exported = [];
  const encrypted: EncryptedBackupSecret[] = [];
  for (const doc of secretDocs) {
    const project = byProject.get(doc.projectId.toString());
    if (isE2eeValue(doc.valueEncrypted)) {
      if (project) encrypted.push({ projectName: project.name, id: doc._id.toString(), name: doc.name, environment: doc.environment, type: doc.type, description: doc.description ?? "", cipher: doc.valueEncrypted });
      exported.push(eventOf(doc, actor, "exported", "to a vault backup"));
      continue;
    }
    project?.secrets.push({
      name: doc.name,
      environment: doc.environment,
      type: doc.type,
      description: doc.description ?? "",
      value: decryptSecret(doc.valueEncrypted, contextOf(userId, doc._id)),
    });
    exported.push(eventOf(doc, actor, "exported", "to a vault backup"));
  }
  await logEvents(userId, exported);
  return { projects: [...byProject.values()], encrypted, secretCount: exported.length };
}

export type BackupImportResult = ImportResult & { projectsCreated: number };

export async function importBackup(userId: ObjectId, actor: Actor, backup: BackupProject<Environment, SecretType>[], overwrite: boolean): Promise<BackupImportResult> {
  const { projects } = await collections();
  const known = new Map((await projects.find({ userId }, { projection: { _id: 1, nameKey: 1 } }).toArray()).map((doc) => [doc.nameKey, doc._id]));

  const total: BackupImportResult = { ...emptyResult(), projectsCreated: 0 };
  for (const project of backup) {
    const fail = (error: string) => total.failed.push({ name: project.name, error });
    if (project.name.length > LIMITS.projectName) {
      fail(`The project name must be at most ${LIMITS.projectName} characters.`);
      continue;
    }
    if (project.description.length > LIMITS.projectDescription) {
      fail(`The project description must be at most ${LIMITS.projectDescription} characters.`);
      continue;
    }

    let projectId = known.get(keyOf(project.name));
    if (!projectId) {
      try {
        projectId = new ObjectId((await createProject(userId, { name: project.name, description: project.description })).id);
        total.projectsCreated += 1;
        known.set(keyOf(project.name), projectId);
      } catch (error) {
        if (error instanceof LimitError || error instanceof NameTakenError) {
          fail(error.message);
          continue;
        }
        throw error;
      }
    }

    const result = await importEntries(userId, actor, projectId, project.secrets, { overwrite, source: "a vault backup" });
    if (!result) {
      fail("The project was deleted during the restore.");
      continue;
    }
    total.created += result.created;
    total.updated += result.updated;
    total.unchanged += result.unchanged;
    total.skipped += result.skipped;
    total.failed.push(...result.failed.map((item) => ({ name: `${project.name} / ${item.name}`, error: item.error })));
  }
  return total;
}
