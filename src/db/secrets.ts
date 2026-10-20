/**
 * Secrets: the values you store. The value is encrypted before it is saved and is only decrypted by
 * revealSecret() (and by the version history in secret-history.ts). Every other function returns a
 * PublicSecret, which has no value in it at all, so a secret can't leak through a list or a page by accident.
 *
 * Functions take the OWNER's id (`userId`: whose data it is, see access.ts) and, where something is logged,
 * the `actor` who is doing it. Routes work out both from the logged-in user's role first.
 *
 * Every change is written to the audit log (secret-events.ts). Replacing a value keeps the old one in
 * the version history (up to LIMITS.versions per secret).
 */
import { ObjectId } from "mongodb";
import { decryptSecret, encryptSecret } from "@/lib/vault-crypto";
import { LIMITS, environmentLabel, secretTypeLabel, type Environment, type SecretType } from "@/modules/vault/constants";
import { accessibleProjectIds, type Actor } from "./access";
import { collections, keyOf, type AuditAction, type SecretDoc } from "./collections";
import { isDuplicateKeyError, LimitError, NameTakenError, NotFoundError } from "./errors";
import { logEvent, logEvents, type EventInput } from "./secret-events";

export type PublicSecret = {
  id: string;
  projectId: string;
  name: string;
  environment: Environment;
  type: SecretType;
  createdAt: string;
  updatedAt: string;
};

const toPublic = (doc: SecretDoc): PublicSecret => ({
  id: doc._id.toString(),
  projectId: doc.projectId.toString(),
  name: doc.name,
  environment: doc.environment,
  type: doc.type,
  createdAt: doc.createdAt.toISOString(),
  updatedAt: doc.updatedAt.toISOString(),
});

/** Ties the ciphertext to its owner and its record (see vault-crypto.ts). Old versions use the same context. */
export const contextOf = (userId: ObjectId, secretId: ObjectId) => `${userId.toString()}:${secretId.toString()}`;

export const eventOf = (doc: Pick<SecretDoc, "_id" | "name" | "environment" | "projectId">, actor: Actor, action: AuditAction, detail?: string): EventInput => ({
  actor,
  secretId: doc._id,
  secretName: doc.name,
  environment: doc.environment,
  projectId: doc.projectId,
  action,
  ...(detail ? { detail } : {}),
});

const TAKEN = "That project already has a secret with this name in this environment.";

/** The secrets of every project the user can open (their own and shared ones), or of one of them. */
export async function listSecrets(actorId: ObjectId, filter: { projectId?: ObjectId } = {}): Promise<PublicSecret[]> {
  const { secrets } = await collections();
  const projectIds = await accessibleProjectIds(actorId);
  const scope = filter.projectId ? projectIds.filter((id) => id.equals(filter.projectId!)) : projectIds;
  const docs = await secrets.find({ projectId: { $in: scope } }).sort({ updatedAt: -1 }).toArray();
  return docs.map(toPublic);
}

export async function countSecrets(actorId: ObjectId): Promise<number> {
  const { secrets } = await collections();
  return secrets.countDocuments({ projectId: { $in: await accessibleProjectIds(actorId) } });
}

export async function usedEnvironments(actorId: ObjectId): Promise<string[]> {
  const { secrets } = await collections();
  return secrets.distinct("environment", { projectId: { $in: await accessibleProjectIds(actorId) } });
}

/** Returns null when the project doesn't exist (or isn't yours). */
export async function createSecret(
  userId: ObjectId,
  actor: Actor,
  input: { projectId: ObjectId; name: string; environment: Environment; type: SecretType; value: string },
  options: { action?: AuditAction; detail?: string } = {},
): Promise<PublicSecret | null> {
  const { projects, secrets } = await collections();
  if (!(await projects.findOne({ _id: input.projectId, userId }, { projection: { _id: 1 } }))) return null;
  if ((await secrets.countDocuments({ userId })) >= LIMITS.secrets) {
    throw new LimitError(`You can store up to ${LIMITS.secrets} secrets.`);
  }

  const _id = new ObjectId(); // made up front: the id is part of what protects the ciphertext
  const now = new Date();
  const doc: SecretDoc = {
    _id,
    userId,
    projectId: input.projectId,
    name: input.name,
    nameKey: keyOf(input.name),
    environment: input.environment,
    type: input.type,
    valueEncrypted: encryptSecret(input.value, contextOf(userId, _id)),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await secrets.insertOne(doc);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new NameTakenError(TAKEN);
    throw error;
  }
  await projects.updateOne({ _id: input.projectId, userId }, { $set: { updatedAt: now } });
  await logEvent(userId, eventOf(doc, actor, options.action ?? "created", options.detail));
  return toPublic(doc);
}

type Patch = { name?: string; environment?: Environment; type?: SecretType; value?: string; projectId?: ObjectId };

/**
 * Only the fields you pass are changed. Leave `value` out to keep the stored value. Returns null if the secret
 * isn't found; throws NotFoundError if the project you are moving it to isn't yours.
 * Replacing the value stores the previous one as a version.
 */
export async function updateSecret(
  userId: ObjectId,
  actor: Actor,
  secretId: ObjectId,
  patch: Patch,
  options: { valueAction?: "value_changed" | "restored"; detail?: string } = {},
): Promise<PublicSecret | null> {
  const { projects, secrets, versions } = await collections();
  const changes: Partial<SecretDoc> = { updatedAt: new Date() };
  if (patch.name !== undefined) Object.assign(changes, { name: patch.name, nameKey: keyOf(patch.name) });
  if (patch.environment !== undefined) changes.environment = patch.environment;
  if (patch.type !== undefined) changes.type = patch.type;
  if (patch.value !== undefined) changes.valueEncrypted = encryptSecret(patch.value, contextOf(userId, secretId));

  let target: { _id: ObjectId; name: string } | null = null;
  if (patch.projectId) {
    target = await projects.findOne({ _id: patch.projectId, userId }, { projection: { _id: 1, name: 1 } });
    if (!target) throw new NotFoundError("A secret can only be moved to another project of the same owner.");
    changes.projectId = patch.projectId;
  }

  let before: SecretDoc | null;
  try {
    before = await secrets.findOneAndUpdate({ _id: secretId, userId }, { $set: changes }, { returnDocument: "before" });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new NameTakenError(TAKEN);
    throw error;
  }
  if (!before) return null;
  const after: SecretDoc = { ...before, ...changes };
  const when = changes.updatedAt as Date;

  const events: EventInput[] = [];
  const diffs: string[] = [];
  if (patch.name !== undefined && patch.name !== before.name) diffs.push(`name “${before.name}” → “${patch.name}”`);
  if (patch.environment !== undefined && patch.environment !== before.environment) {
    diffs.push(`environment ${environmentLabel(before.environment)} → ${environmentLabel(patch.environment)}`);
  }
  if (patch.type !== undefined && patch.type !== before.type) diffs.push(`type ${secretTypeLabel(before.type)} → ${secretTypeLabel(patch.type)}`);
  if (diffs.length) events.push(eventOf(after, actor, "updated", diffs.join(", ")));

  if (target && !target._id.equals(before.projectId)) {
    const source = await projects.findOne({ _id: before.projectId, userId }, { projection: { name: 1 } });
    events.push(eventOf(after, actor, "moved", `${source?.name ?? "a deleted project"} → ${target.name}`));
    await projects.updateMany({ _id: { $in: [before.projectId, target._id] }, userId }, { $set: { updatedAt: when } });
  }

  if (patch.value !== undefined) {
    await versions.insertOne({ _id: new ObjectId(), userId, secretId, valueEncrypted: before.valueEncrypted, createdAt: when });
    const stale = await versions.find({ userId, secretId }, { projection: { _id: 1 } }).sort({ createdAt: -1, _id: -1 }).skip(LIMITS.versions).toArray();
    if (stale.length) await versions.deleteMany({ userId, secretId, _id: { $in: stale.map((v) => v._id) } });
    events.push(eventOf(after, actor, options.valueAction ?? "value_changed", options.detail));
  }

  await logEvents(userId, events);
  return toPublic(after);
}

export type BulkResult = { updated: number; failed: { id: string; name: string; error: string }[] };

/** Applies the same change to many secrets. A secret that can't take it (e.g. the name is taken there) is reported, not fatal. */
export async function bulkUpdateSecrets(
  userId: ObjectId,
  actor: Actor,
  ids: ObjectId[],
  patch: Pick<Patch, "environment" | "type" | "projectId">,
): Promise<BulkResult> {
  const { secrets } = await collections();
  const docs = await secrets.find({ userId, _id: { $in: ids } }, { projection: { name: 1 } }).toArray();
  const result: BulkResult = { updated: 0, failed: [] };
  for (const doc of docs) {
    try {
      if (await updateSecret(userId, actor, doc._id, patch)) result.updated += 1;
    } catch (error) {
      if (!(error instanceof NameTakenError)) throw error; // anything else (e.g. wrong target project) applies to all of them
      result.failed.push({ id: doc._id.toString(), name: doc.name, error: error.message });
    }
  }
  return result;
}

export async function deleteSecret(userId: ObjectId, actor: Actor, secretId: ObjectId): Promise<boolean> {
  return (await deleteSecrets(userId, actor, [secretId])) > 0;
}

/** Deletes secrets and their version history, and records the deletion in the audit log. Returns how many were deleted. */
export async function deleteSecrets(userId: ObjectId, actor: Actor, ids: ObjectId[]): Promise<number> {
  const { secrets, versions } = await collections();
  const docs = await secrets.find({ userId, _id: { $in: ids } }, { projection: { name: 1, environment: 1, projectId: 1 } }).toArray();
  if (!docs.length) return 0;
  const found = docs.map((doc) => doc._id);
  const { deletedCount } = await secrets.deleteMany({ userId, _id: { $in: found } });
  await versions.deleteMany({ userId, secretId: { $in: found } });
  await logEvents(userId, docs.map((doc) => eventOf(doc, actor, "deleted")));
  return deletedCount;
}

/** The only place the CURRENT stored value is decrypted. Returns null when the secret doesn't exist (or isn't yours). */
export async function revealSecret(userId: ObjectId, actor: Actor, secretId: ObjectId): Promise<string | null> {
  const { secrets } = await collections();
  const doc = await secrets.findOne({ _id: secretId, userId });
  if (!doc) return null;
  const value = decryptSecret(doc.valueEncrypted, contextOf(userId, secretId));
  await logEvent(userId, eventOf(doc, actor, "revealed"));
  return value;
}
