/**
 * Secrets: the values you store. The value is encrypted before it is saved and is only decrypted by
 * revealSecret(). Every other function returns a PublicSecret, which has no value in it at all, so a
 * secret can't leak through a list or a page by accident.
 */
import { ObjectId } from "mongodb";
import { decryptSecret, encryptSecret } from "@/lib/vault-crypto";
import { LIMITS, type Environment, type SecretType } from "@/modules/vault/constants";
import { collections, keyOf, type SecretDoc } from "./collections";
import { isDuplicateKeyError, LimitError, NameTakenError } from "./errors";

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

/** Ties the ciphertext to its owner and its record (see vault-crypto.ts). */
const contextOf = (userId: ObjectId, secretId: ObjectId) => `${userId.toString()}:${secretId.toString()}`;

const TAKEN = "That project already has a secret with this name in this environment.";

export async function listSecrets(userId: ObjectId, filter: { projectId?: ObjectId } = {}): Promise<PublicSecret[]> {
  const { secrets } = await collections();
  const docs = await secrets.find({ userId, ...(filter.projectId ? { projectId: filter.projectId } : {}) }).sort({ updatedAt: -1 }).toArray();
  return docs.map(toPublic);
}

export async function countSecrets(userId: ObjectId): Promise<number> {
  const { secrets } = await collections();
  return secrets.countDocuments({ userId });
}

export async function usedEnvironments(userId: ObjectId): Promise<string[]> {
  const { secrets } = await collections();
  return secrets.distinct("environment", { userId });
}

/** Returns null when the project doesn't exist (or isn't yours). */
export async function createSecret(
  userId: ObjectId,
  input: { projectId: ObjectId; name: string; environment: Environment; type: SecretType; value: string },
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
  return toPublic(doc);
}

/** Only the fields you pass are changed. Leave `value` out to keep the stored value. Returns null if not found. */
export async function updateSecret(
  userId: ObjectId,
  secretId: ObjectId,
  patch: { name?: string; environment?: Environment; type?: SecretType; value?: string },
): Promise<PublicSecret | null> {
  const { secrets } = await collections();
  const changes: Partial<SecretDoc> = { updatedAt: new Date() };
  if (patch.name !== undefined) Object.assign(changes, { name: patch.name, nameKey: keyOf(patch.name) });
  if (patch.environment !== undefined) changes.environment = patch.environment;
  if (patch.type !== undefined) changes.type = patch.type;
  if (patch.value !== undefined) changes.valueEncrypted = encryptSecret(patch.value, contextOf(userId, secretId));

  try {
    const doc = await secrets.findOneAndUpdate({ _id: secretId, userId }, { $set: changes }, { returnDocument: "after" });
    return doc ? toPublic(doc) : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new NameTakenError(TAKEN);
    throw error;
  }
}

export async function deleteSecret(userId: ObjectId, secretId: ObjectId): Promise<boolean> {
  const { secrets } = await collections();
  const { deletedCount } = await secrets.deleteOne({ _id: secretId, userId });
  return deletedCount > 0;
}

/** The only place a stored value is decrypted. Returns null when the secret doesn't exist (or isn't yours). */
export async function revealSecret(userId: ObjectId, secretId: ObjectId): Promise<string | null> {
  const { secrets } = await collections();
  const doc = await secrets.findOne({ _id: secretId, userId });
  return doc ? decryptSecret(doc.valueEncrypted, contextOf(userId, secretId)) : null;
}
