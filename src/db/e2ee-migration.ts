/**
 * Moving existing (server-encrypted) secrets to end-to-end encryption. The browser asks for the plain values (legacySecrets),
 * encrypts each one with the vault key, checks it can open it again, and sends the ciphertext back (migrateSecrets), which
 * replaces the current value AND every old version. After that the server holds nothing it can read.
 *
 * Only secrets of projects that are not shared move, because a member has no vault key.
 */
import type { ObjectId } from "mongodb";
import { isE2eeValue } from "@/lib/e2ee";
import { decryptSecret } from "@/lib/vault-crypto";
import type { Actor } from "./access";
import { collections } from "./collections";
import { logEvents, type EventInput } from "./secret-events";
import { guardProject, transaction } from "./project-transaction";
import { projectIsShared } from "./vault-keys";
import { contextOf, eventOf } from "./secrets";

export type LegacySecret = { id: string; name: string; value: string; versions: { id: string; value: string }[] };
export type MigrationItem = { id: ObjectId; cipher: string; versions: { id: ObjectId; cipher: string }[] };
export type MigrationResult = { migrated: number; failed: { id: string; error: string }[] };

async function unsharedProjectIds(userId: ObjectId): Promise<ObjectId[]> {
  const { projects, members } = await collections();
  const [owned, shared] = await Promise.all([
    projects.find({ userId }, { projection: { _id: 1 } }).toArray(),
    members.distinct("projectId", { ownerId: userId }),
  ]);
  const sharedIds = new Set(shared.map((id) => id.toString()));
  return owned.map((doc) => doc._id).filter((id) => !sharedIds.has(id.toString()));
}

/** The plain values of every server-encrypted secret (and its history) in the owner's unshared projects. */
export async function legacySecrets(userId: ObjectId, actor: Actor): Promise<LegacySecret[]> {
  const { secrets, versions } = await collections();
  const projectIds = await unsharedProjectIds(userId);
  const docs = (await secrets.find({ userId, projectId: { $in: projectIds } }).toArray()).filter((doc) => !isE2eeValue(doc.valueEncrypted));
  if (!docs.length) return [];
  const history = await versions.find({ userId, secretId: { $in: docs.map((doc) => doc._id) } }).toArray();

  const result = docs.map(
    (doc): LegacySecret => ({
      id: doc._id.toString(),
      name: doc.name,
      value: decryptSecret(doc.valueEncrypted, contextOf(userId, doc._id)),
      versions: history
        .filter((v) => v.secretId.equals(doc._id) && !isE2eeValue(v.valueEncrypted))
        .map((v) => ({ id: v._id.toString(), value: decryptSecret(v.valueEncrypted, contextOf(userId, doc._id)) })),
    }),
  );
  await logEvents(userId, docs.map((doc) => eventOf(doc, actor, "exported", "to be encrypted end-to-end")));
  return result;
}

/**
 * Converts each secret and its history atomically, coordinating with moves, value writes and sharing.
 */
export async function migrateSecrets(userId: ObjectId, actor: Actor, items: MigrationItem[]): Promise<MigrationResult> {
  const { secrets, versions } = await collections();
  const result: MigrationResult = { migrated: 0, failed: [] };
  const events: EventInput[] = [];

  for (const item of items) {
    const outcome = await transaction(async (session) => {
      const fail = (error: string) => ({ error });
      const doc = await secrets.findOne({ _id: item.id, userId }, { session });
      if (!doc) {
        return fail("Secret not found.");
      }
      await guardProject(userId, doc.projectId, session);
      if (isE2eeValue(doc.valueEncrypted)) {
        return fail("Already encrypted end-to-end.");
      }
      if (await projectIsShared(doc.projectId, session)) {
        return fail("This project is shared, so its secrets stay server-encrypted.");
      }

      const old = (await versions.find({ userId, secretId: doc._id }, { session }).toArray()).filter((v) => !isE2eeValue(v.valueEncrypted));
      const supplied = new Map(item.versions.map((v) => [v.id.toString(), v.cipher]));
      if (old.some((v) => !supplied.has(v._id.toString()))) {
        return fail("The history changed while encrypting. Try again.");
      }

      let stale = false;
      for (const version of old) {
        const { modifiedCount } = await versions.updateOne(
          { _id: version._id, userId, secretId: doc._id, valueEncrypted: version.valueEncrypted },
          { $set: { valueEncrypted: supplied.get(version._id.toString())! } },
          { session },
        );
        if (modifiedCount !== 1) stale = true;
      }
      const updated = stale ? 0 : (await secrets.updateOne({ _id: doc._id, userId, valueEncrypted: doc.valueEncrypted }, { $set: { valueEncrypted: item.cipher } }, { session })).modifiedCount;
      if (updated !== 1) {
        return fail("The secret changed while encrypting. Try again.");
      }
      return { event: eventOf(doc, actor, "updated", "encrypted end-to-end") };
    });
    if ("error" in outcome) result.failed.push({ id: item.id.toString(), error: outcome.error });
    else {
      result.migrated += 1;
      events.push(outcome.event);
    }
  }
  await logEvents(userId, events);
  return result;
}
