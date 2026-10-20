/**
 * Version history of a secret: the values it had before. Like the current value, an old value is only
 * decrypted on request (revealVersion) and each look is written to the audit log.
 */
import type { ObjectId } from "mongodb";
import { decryptSecret } from "@/lib/vault-crypto";
import type { Actor } from "./access";
import { collections } from "./collections";
import { logEvent } from "./secret-events";
import { contextOf, eventOf, updateSecret, type PublicSecret } from "./secrets";

export type PublicVersion = { id: string; createdAt: string };

/** Newest first. `createdAt` is when that value was replaced. Null when the secret doesn't exist (or isn't yours). */
export async function listVersions(userId: ObjectId, secretId: ObjectId): Promise<PublicVersion[] | null> {
  const { secrets, versions } = await collections();
  if (!(await secrets.findOne({ _id: secretId, userId }, { projection: { _id: 1 } }))) return null;
  const docs = await versions.find({ userId, secretId }).sort({ createdAt: -1, _id: -1 }).toArray();
  return docs.map((doc) => ({ id: doc._id.toString(), createdAt: doc.createdAt.toISOString() }));
}

/** Returns null when the secret or version doesn't exist (or isn't yours). */
export async function revealVersion(userId: ObjectId, actor: Actor, secretId: ObjectId, versionId: ObjectId): Promise<string | null> {
  const { secrets, versions } = await collections();
  const [secret, version] = await Promise.all([secrets.findOne({ _id: secretId, userId }), versions.findOne({ _id: versionId, userId, secretId })]);
  if (!secret || !version) return null;
  const value = decryptSecret(version.valueEncrypted, contextOf(userId, secretId));
  await logEvent(userId, eventOf(secret, actor, "revealed", `old version from ${version.createdAt.toISOString().slice(0, 10)}`));
  return value;
}

/** Makes an old value the current one again. The value it replaces is kept as a new version. */
export async function restoreVersion(userId: ObjectId, actor: Actor, secretId: ObjectId, versionId: ObjectId): Promise<PublicSecret | null> {
  const { versions } = await collections();
  const version = await versions.findOne({ _id: versionId, userId, secretId });
  if (!version) return null;
  const value = decryptSecret(version.valueEncrypted, contextOf(userId, secretId));
  return updateSecret(userId, actor, secretId, { value }, { valueAction: "restored", detail: `value from ${version.createdAt.toISOString().slice(0, 10)}` });
}
