/**
 * Version history of a secret: the values it had before. Like the current value, an old value is only
 * decrypted on request (revealVersion) and each look is written to the audit log.
 *
 * End-to-end encrypted versions are never decrypted here: the browser gets the ciphertext. A restore copies the old ciphertext back
 * as the current value, which is valid because it was made for this same secret (the context is userId:secretId).
 */
import type { ObjectId } from "mongodb";
import { isE2eeValue } from "@/lib/e2ee";
import { decryptSecret } from "@/lib/vault-crypto";
import type { Actor } from "./access";
import { collections } from "./collections";
import { E2eeError } from "./errors";
import { logEvent } from "./secret-events";
import { contextOf, eventOf, revealStored, updateSecret, type PublicSecret, type Revealed } from "./secrets";

export type PublicVersion = { id: string; createdAt: string };

/** Newest first. `createdAt` is when that value was replaced. Null when the secret doesn't exist (or isn't yours). */
export async function listVersions(userId: ObjectId, secretId: ObjectId): Promise<PublicVersion[] | null> {
  const { secrets, versions } = await collections();
  if (!(await secrets.findOne({ _id: secretId, userId }, { projection: { _id: 1 } }))) return null;
  const docs = await versions.find({ userId, secretId }).sort({ createdAt: -1, _id: -1 }).toArray();
  return docs.map((doc) => ({ id: doc._id.toString(), createdAt: doc.createdAt.toISOString() }));
}

/** Returns null when the secret or version doesn't exist (or isn't yours). */
export async function revealVersion(userId: ObjectId, actor: Actor, secretId: ObjectId, versionId: ObjectId): Promise<Revealed | null> {
  const { secrets, versions } = await collections();
  const [secret, version] = await Promise.all([secrets.findOne({ _id: secretId, userId }), versions.findOne({ _id: versionId, userId, secretId })]);
  if (!secret || !version) return null;
  const revealed = revealStored(version.valueEncrypted, userId, secretId);
  await logEvent(userId, eventOf(secret, actor, "revealed", `old version from ${version.createdAt.toISOString().slice(0, 10)}`));
  return revealed;
}

/** Makes an old value the current one again. The value it replaces is kept as a new version. */
export async function restoreVersion(userId: ObjectId, actor: Actor, secretId: ObjectId, versionId: ObjectId): Promise<PublicSecret | null> {
  const { secrets, versions } = await collections();
  const version = await versions.findOne({ _id: versionId, userId, secretId });
  if (!version) return null;
  const detail = `value from ${version.createdAt.toISOString().slice(0, 10)}`;

  if (isE2eeValue(version.valueEncrypted)) {
    const current = await secrets.findOne({ _id: secretId, userId }, { projection: { valueEncrypted: 1 } });
    if (!current) return null;
    if (!isE2eeValue(current.valueEncrypted)) throw new E2eeError("This old value is end-to-end encrypted and can’t be restored onto a server-encrypted secret.", "e2ee_unavailable");
    return updateSecret(userId, actor, secretId, { cipher: version.valueEncrypted }, { valueAction: "restored", detail });
  }
  const value = decryptSecret(version.valueEncrypted, contextOf(userId, secretId));
  return updateSecret(userId, actor, secretId, { value }, { valueAction: "restored", detail });
}
