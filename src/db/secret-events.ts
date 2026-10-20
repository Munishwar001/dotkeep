/**
 * The audit log: who did what to which secret, and when. Only metadata is stored, never a value.
 * Writing a log line must never break the action it describes, so failures are logged and swallowed.
 *
 * Whoever can open a project sees its log, including what the other members did.
 */
import { logError } from "@/lib/logger";
import type { ObjectId } from "mongodb";
import { collections, type AuditAction, type SecretEventDoc } from "./collections";
import type { Actor } from "./access";
import type { Environment } from "@/modules/vault/constants";

export type PublicEvent = {
  id: string;
  secretId: string;
  secretName: string;
  environment: Environment;
  projectId: string;
  action: AuditAction;
  detail: string | null;
  /** Who did it. Null for lines from before sharing existed (that was always the owner). */
  actorName: string | null;
  createdAt: string;
};

export type EventInput = {
  secretId: ObjectId;
  secretName: string;
  environment: Environment;
  projectId: ObjectId;
  action: AuditAction;
  detail?: string;
  actor: Actor;
};

/** `ownerId` is whose data it is (the project owner). */
export async function logEvents(ownerId: ObjectId, inputs: EventInput[]): Promise<void> {
  if (!inputs.length) return;
  try {
    const { events } = await collections();
    const createdAt = new Date();
    await events.insertMany(
      inputs.map(({ actor, ...input }) => ({ ...input, userId: ownerId, actorId: actor.id, actorName: actor.name, createdAt })) as SecretEventDoc[],
    );
  } catch (error) {
    await logError(error, "audit log write failed");
  }
}

export const logEvent = (ownerId: ObjectId, input: EventInput) => logEvents(ownerId, [input]);

/** Events of every project you own or are a member of, newest first. Optionally only one secret's. */
export async function listEvents(actorId: ObjectId, filter: { secretId?: ObjectId; limit?: number } = {}): Promise<PublicEvent[]> {
  const { events, members } = await collections();
  const memberOf = (await members.find({ userId: actorId }, { projection: { projectId: 1 } }).toArray()).map((m) => m.projectId);
  const docs = await events
    .find({ $or: [{ userId: actorId }, { projectId: { $in: memberOf } }], ...(filter.secretId ? { secretId: filter.secretId } : {}) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(filter.limit ?? 200)
    .toArray();
  return docs.map((doc) => ({
    id: doc._id.toString(),
    secretId: doc.secretId.toString(),
    secretName: doc.secretName,
    environment: doc.environment,
    projectId: doc.projectId.toString(),
    action: doc.action,
    detail: doc.detail ?? null,
    actorName: doc.actorName ?? null,
    createdAt: doc.createdAt.toISOString(),
  }));
}
