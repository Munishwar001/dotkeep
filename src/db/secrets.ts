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
import { ObjectId, type ClientSession } from "mongodb";
import { isE2eeValue } from "@/lib/e2ee";
import { decryptSecret, encryptSecret } from "@/lib/vault-crypto";
import { LIMITS, environmentLabel, secretTypeLabel, type Environment, type SecretType } from "@/modules/vault/constants";
import { accessibleProjectIds, type Actor } from "./access";
import { collections, keyOf, type AuditAction, type SecretDoc } from "./collections";
import { E2eeError, isDuplicateKeyError, LimitError, NameTakenError, NotFoundError } from "./errors";
import { logEvent, logEvents, type EventInput } from "./secret-events";
import { projectIsShared, userHasE2ee } from "./vault-keys";

export type PublicSecret = {
  id: string;
  projectId: string;
  name: string;
  environment: Environment;
  type: SecretType;
  description: string;
  /** True when the value is end-to-end encrypted: only the owner's browser can read it. */
  e2ee: boolean;
  createdAt: string;
  updatedAt: string;
};

const toPublic = (doc: SecretDoc): PublicSecret => ({
  id: doc._id.toString(),
  projectId: doc.projectId.toString(),
  name: doc.name,
  environment: doc.environment,
  type: doc.type,
  description: doc.description ?? "",
  e2ee: isE2eeValue(doc.valueEncrypted),
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

import { guardProject, transaction } from "./project-transaction";

const TAKEN = "That project already has a secret with this name in this environment.";

/**
 * Which kind of value may be stored in a project.
 *  - "cipher" (already encrypted in the browser, "e1$..."): only the owner, only after turning end-to-end encryption on, and only in a
 *    project that is not shared. A member has no vault key, so a secret they can't read must never appear in their project.
 *  - "plain" (the server encrypts it): not allowed for an end-to-end user in an unshared project. Otherwise a stale or hostile client
 *    could hand the server a plaintext value and quietly undo the protection. Shared projects keep server-side encryption.
 */
async function checkStorage(owner: ObjectId, actor: Actor, projectId: ObjectId, kind: "cipher" | "plain", session: ClientSession) {
  const enabled = await userHasE2ee(owner);
  const shared = await projectIsShared(projectId, session);
  if (kind === "cipher") {
    if (!enabled) throw new E2eeError("Turn on end-to-end encryption in Settings first.", "e2ee_unavailable");
    if (shared) throw new E2eeError("This project is shared, so its secrets can’t be end-to-end encrypted yet.", "e2ee_unavailable");
    if (!actor.id.equals(owner)) throw new E2eeError("Only the owner can store an end-to-end encrypted value.", "e2ee_unavailable");
  } else if (enabled && !shared) {
    throw new E2eeError("Your account uses end-to-end encryption, so this value has to be encrypted in your browser first.", "e2ee_required");
  }
}

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
  input: { projectId: ObjectId; name: string; environment: Environment; type: SecretType; description?: string } & (
    | { value: string; cipher?: undefined; id?: undefined }
    // An end-to-end value is encrypted in the browser, and its id is part of what protects it, so the browser picks the id too.
    | { cipher: string; id: ObjectId; value?: undefined }
  ),
  options: { action?: AuditAction; detail?: string } = {},
): Promise<PublicSecret | null> {
  let events: EventInput[] = [];
  const result = await transaction((session) => {
    events = [];
    return createSecretInTransaction(userId, actor, input, options, session, events);
  });
  await logEvents(userId, events);
  return result;
}

async function createSecretInTransaction(
  userId: ObjectId,
  actor: Actor,
  input: { projectId: ObjectId; name: string; environment: Environment; type: SecretType; description?: string } & (
    | { value: string; cipher?: undefined; id?: undefined }
    // An end-to-end value is encrypted in the browser, and its id is part of what protects it, so the browser picks the id too.
    | { cipher: string; id: ObjectId; value?: undefined }
  ),
  options: { action?: AuditAction; detail?: string } = {},
  session: ClientSession,
  events: EventInput[],
): Promise<PublicSecret | null> {
  const { projects, secrets } = await collections();
  if (!(await projects.findOne({ _id: input.projectId, userId }, { projection: { _id: 1 }, session }))) return null;
  await guardProject(userId, input.projectId, session);
  if ((await secrets.countDocuments({ userId }, { session })) >= LIMITS.secrets) {
    throw new LimitError(`You can store up to ${LIMITS.secrets} secrets.`);
  }
  await checkStorage(userId, actor, input.projectId, input.cipher !== undefined ? "cipher" : "plain", session);

  const _id = input.id ?? new ObjectId(); // made up front: the id is part of what protects the ciphertext
  if (input.id && (await secrets.findOne({ _id }, { projection: { _id: 1 }, session }))) throw new NameTakenError("Something went wrong saving this secret. Please try again.");
  const now = new Date();
  const doc: SecretDoc = {
    _id,
    userId,
    projectId: input.projectId,
    name: input.name,
    nameKey: keyOf(input.name),
    environment: input.environment,
    type: input.type,
    description: input.description ?? "",
    valueEncrypted: input.cipher ?? encryptSecret(input.value, contextOf(userId, _id)),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await secrets.insertOne(doc, { session });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new NameTakenError(TAKEN);
    throw error;
  }
  await projects.updateOne({ _id: input.projectId, userId }, { $set: { updatedAt: now } }, { session });
  events.push(eventOf(doc, actor, options.action ?? "created", options.detail));
  return toPublic(doc);
}

/** `value` is encrypted by the server; `cipher` was already encrypted in the browser (end-to-end). Pass at most one of them. */
export type Patch = { name?: string; environment?: Environment; type?: SecretType; description?: string; value?: string; cipher?: string; projectId?: ObjectId };

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
  let events: EventInput[] = [];
  const result = await transaction((session) => {
    events = [];
    return updateSecretInTransaction(userId, actor, secretId, patch, options, session, events);
  });
  await logEvents(userId, events);
  return result;
}

async function updateSecretInTransaction(
  userId: ObjectId,
  actor: Actor,
  secretId: ObjectId,
  patch: Patch,
  options: { valueAction?: "value_changed" | "restored"; detail?: string } = {},
  session: ClientSession,
  events: EventInput[],
): Promise<PublicSecret | null> {
  const { projects, secrets, versions } = await collections();
  const initial = await secrets.findOne({ _id: secretId, userId }, { session });
  if (!initial) return null;
  if (patch.projectId && !(await projects.findOne({ _id: patch.projectId, userId }, { session, projection: { _id: 1 } }))) {
    throw new NotFoundError("A secret can only be moved to another project of the same owner.");
  }
  for (const projectId of [...new Map([initial.projectId, patch.projectId ?? initial.projectId].map((id) => [id.toString(), id])).values()].sort((a, b) => a.toString().localeCompare(b.toString()))) {
    await guardProject(userId, projectId, session);
  }
  const changes: Partial<SecretDoc> = { updatedAt: new Date() };
  if (patch.name !== undefined) Object.assign(changes, { name: patch.name, nameKey: keyOf(patch.name) });
  if (patch.environment !== undefined) changes.environment = patch.environment;
  if (patch.type !== undefined) changes.type = patch.type;
  if (patch.description !== undefined) changes.description = patch.description;
  if (patch.value !== undefined) changes.valueEncrypted = encryptSecret(patch.value, contextOf(userId, secretId));
  if (patch.cipher !== undefined) changes.valueEncrypted = patch.cipher;

  if (patch.value !== undefined || patch.cipher !== undefined || patch.projectId) {
    const current = await secrets.findOne({ _id: secretId, userId }, { projection: { valueEncrypted: 1, projectId: 1 }, session });
    if (!current) return null;
    const endToEnd = isE2eeValue(current.valueEncrypted);
    const destination = patch.projectId ?? current.projectId;
    if (patch.cipher !== undefined) {
      // A server-encrypted secret has server-readable history, so it goes through the migration (which re-encrypts that too).
      if (!endToEnd) throw new E2eeError("Encrypt your existing secrets first, in Settings → End-to-end encryption.", "e2ee_migrate_first");
      await checkStorage(userId, actor, destination, "cipher", session);
    } else if (patch.value !== undefined) {
      if (endToEnd) throw new E2eeError("This secret is end-to-end encrypted, so its new value has to be encrypted in your browser first.", "e2ee_required");
      await checkStorage(userId, actor, destination, "plain", session);
    } else {
      await checkStorage(userId, actor, destination, endToEnd ? "cipher" : "plain", session);
    }
  }

  let target: { _id: ObjectId; name: string } | null = null;
  if (patch.projectId) {
    target = await projects.findOne({ _id: patch.projectId, userId }, { projection: { _id: 1, name: 1 }, session });
    if (!target) throw new NotFoundError("A secret can only be moved to another project of the same owner.");
    changes.projectId = patch.projectId;
  }

  let before: SecretDoc | null;
  try {
    before = await secrets.findOneAndUpdate({ _id: secretId, userId }, { $set: changes }, { returnDocument: "before", session });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new NameTakenError(TAKEN);
    throw error;
  }
  if (!before) return null;
  const after: SecretDoc = { ...before, ...changes };
  const when = changes.updatedAt as Date;

  const diffs: string[] = [];
  if (patch.name !== undefined && patch.name !== before.name) diffs.push(`name “${before.name}” → “${patch.name}”`);
  if (patch.environment !== undefined && patch.environment !== before.environment) {
    diffs.push(`environment ${environmentLabel(before.environment)} → ${environmentLabel(patch.environment)}`);
  }
  if (patch.type !== undefined && patch.type !== before.type) diffs.push(`type ${secretTypeLabel(before.type)} → ${secretTypeLabel(patch.type)}`);
  if (patch.description !== undefined && patch.description !== (before.description ?? "")) diffs.push("notes changed"); // the text itself stays out of the log
  if (diffs.length) events.push(eventOf(after, actor, "updated", diffs.join(", ")));

  if (target && !target._id.equals(before.projectId)) {
    const source = await projects.findOne({ _id: before.projectId, userId }, { projection: { name: 1 }, session });
    events.push(eventOf(after, actor, "moved", `${source?.name ?? "a deleted project"} → ${target.name}`));
    await projects.updateMany({ _id: { $in: [before.projectId, target._id] }, userId }, { $set: { updatedAt: when } }, { session });
  }

  if (patch.value !== undefined || patch.cipher !== undefined) {
    await versions.insertOne({ _id: new ObjectId(), userId, secretId, valueEncrypted: before.valueEncrypted, createdAt: when }, { session });
    const stale = await versions.find({ userId, secretId }, { projection: { _id: 1 }, session }).sort({ createdAt: -1, _id: -1 }).skip(LIMITS.versions).toArray();
    if (stale.length) await versions.deleteMany({ userId, secretId, _id: { $in: stale.map((v) => v._id) } }, { session });
    events.push(eventOf(after, actor, options.valueAction ?? "value_changed", options.detail));
  }

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
      if (!(error instanceof NameTakenError || error instanceof E2eeError)) throw error; // anything else (e.g. wrong target project) applies to all of them
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

/** A revealed value: the plain text, or (end-to-end) the ciphertext for the browser to open with the vault key. */
export type Revealed = { value: string } | { cipher: string };

/** The only place the CURRENT stored value is decrypted. Returns null when the secret doesn't exist (or isn't yours). */
export async function revealSecret(userId: ObjectId, actor: Actor, secretId: ObjectId): Promise<Revealed | null> {
  const { secrets } = await collections();
  const doc = await secrets.findOne({ _id: secretId, userId });
  if (!doc) return null;
  const revealed = revealStored(doc.valueEncrypted, userId, secretId);
  await logEvent(userId, eventOf(doc, actor, "revealed"));
  return revealed;
}

/** Server-encrypted values are decrypted here; end-to-end values are handed over still encrypted, the server can't open them. */
export function revealStored(stored: string, userId: ObjectId, secretId: ObjectId): Revealed {
  return isE2eeValue(stored) ? { cipher: stored } : { value: decryptSecret(stored, contextOf(userId, secretId)) };
}
