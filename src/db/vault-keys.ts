/**
 * End-to-end encryption keys. What is stored here is the user's vault key WRAPPED (encrypted) by their passphrase and by their
 * recovery key, both done in the browser (src/lib/e2ee.ts). The server cannot open either copy, and never sees the passphrase,
 * the recovery key or the vault key. These functions only store and hand back the wrapped copies.
 *
 * The same rules decide where end-to-end encrypted values may live (see secrets.ts):
 *  - only the owner's own secrets, because only the owner holds the vault key;
 *  - only in a project that is not shared, so a member never has a secret they cannot read.
 */
import type { ClientSession, ObjectId } from "mongodb";
import type { VaultKeyRecord } from "@/lib/e2ee";
import { collections } from "./collections";
import { usersCollection } from "./users";

export async function getVaultKeys(userId: ObjectId): Promise<VaultKeyRecord | null> {
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId }, { projection: { vaultKeys: 1 } });
  return user?.vaultKeys ?? null;
}

export async function userHasE2ee(userId: ObjectId): Promise<boolean> {
  return (await getVaultKeys(userId)) !== null;
}

/** First-time setup. False when end-to-end encryption is already on (it can't be replaced: that would lock every secret). */
export async function createVaultKeys(userId: ObjectId, record: VaultKeyRecord): Promise<boolean> {
  const users = await usersCollection();
  const { modifiedCount } = await users.updateOne({ _id: userId, vaultKeys: { $exists: false } }, { $set: { vaultKeys: record } });
  return modifiedCount === 1;
}

/**
 * A new passphrase: replaces the passphrase wrap and its KDF settings only. The recovery wrap is kept as it is, so a
 * wrong or hostile record can lock the passphrase out at worst, and the recovery key still opens the vault.
 */
export async function replacePassphraseWrap(userId: ObjectId, record: VaultKeyRecord, expectedWrap: string): Promise<boolean> {
  const users = await usersCollection();
  const { modifiedCount } = await users.updateOne(
    { _id: userId, "vaultKeys.wrappedByRecovery": record.wrappedByRecovery, "vaultKeys.wrappedByPassphrase": expectedWrap },
    { $set: { "vaultKeys.kdf": record.kdf, "vaultKeys.wrappedByPassphrase": record.wrappedByPassphrase } },
  );
  return modifiedCount === 1;
}

/** True when anyone else has been given access to the project. */
export async function projectIsShared(projectId: ObjectId, session?: ClientSession): Promise<boolean> {
  const { members } = await collections();
  return (await members.countDocuments({ projectId }, { limit: 1, session })) > 0;
}

/** True when the project holds at least one end-to-end encrypted secret. Such a project can't be shared. */
export async function projectHasE2eeSecrets(projectId: ObjectId, session?: ClientSession): Promise<boolean> {
  const { secrets } = await collections();
  return (await secrets.countDocuments({ projectId, valueEncrypted: { $regex: "^e1\\$" } }, { limit: 1, session })) > 0;
}
