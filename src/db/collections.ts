/**
 * The `projects` and `secrets` collections: document shapes plus the collection handles.
 * These collections are only ever read or written through the files in src/db/.
 */
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { Environment, SecretType } from "@/modules/vault/constants";

export type ProjectDoc = {
  _id: ObjectId;
  userId: ObjectId; // the owner. Every query filters on this.
  name: string;
  nameKey: string; // lowercase name, used for the "no duplicate names" index
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SecretDoc = {
  _id: ObjectId;
  userId: ObjectId;
  projectId: ObjectId;
  name: string;
  nameKey: string;
  environment: Environment;
  type: SecretType;
  valueEncrypted: string; // AES-256-GCM, see src/lib/vault-crypto.ts. Never the plain value.
  createdAt: Date;
  updatedAt: Date;
};

export type MemberRole = "editor" | "viewer";

/** Someone a project is shared with. The owner is not listed here: it is the project's own `userId`. */
export type ProjectMemberDoc = {
  _id: ObjectId;
  projectId: ObjectId;
  ownerId: ObjectId; // the project's owner, copied so lookups don't need the project
  userId: ObjectId; // the member
  role: MemberRole;
  createdAt: Date;
};

/** An earlier value of a secret. Kept encrypted with the same context as the secret (userId:secretId). */
export type SecretVersionDoc = {
  _id: ObjectId;
  userId: ObjectId;
  secretId: ObjectId;
  valueEncrypted: string;
  createdAt: Date; // when this value was replaced
};

export const AUDIT_ACTIONS = ["created", "revealed", "updated", "value_changed", "moved", "restored", "imported", "exported", "deleted"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** One line of the audit log. Names are copied in, so the line still makes sense after the secret is deleted. */
export type SecretEventDoc = {
  _id: ObjectId;
  userId: ObjectId; // the data owner (the project owner), not necessarily who did it
  actorId?: ObjectId; // who did it. Missing on lines written before sharing existed: that was the owner.
  actorName?: string;
  secretId: ObjectId;
  secretName: string;
  environment: Environment;
  projectId: ObjectId;
  action: AuditAction;
  detail?: string;
  createdAt: Date;
};

/** Turns a string from a URL into an ObjectId, or null. (ObjectId.isValid alone accepts any 12-char string.) */
export function parseObjectId(value: string | undefined | null): ObjectId | null {
  return value && /^[0-9a-f]{24}$/i.test(value) ? new ObjectId(value) : null;
}

export const keyOf = (name: string) => name.trim().toLowerCase();

// Indexes are created once per server start (creating them again is harmless). On failure we retry next time.
let ready: Promise<unknown> | null = null;

function ensureIndexes(
  projects: Collection<ProjectDoc>,
  secrets: Collection<SecretDoc>,
  versions: Collection<SecretVersionDoc>,
  events: Collection<SecretEventDoc>,
  members: Collection<ProjectMemberDoc>,
) {
  ready ??= Promise.all([
    projects.createIndex({ userId: 1, nameKey: 1 }, { unique: true }), // one project name per user
    projects.createIndex({ userId: 1, updatedAt: -1 }),
    // the same secret name is fine in different environments (DATABASE_URL in local and in production)
    secrets.createIndex({ userId: 1, projectId: 1, environment: 1, nameKey: 1 }, { unique: true }),
    secrets.createIndex({ userId: 1, updatedAt: -1 }),
    versions.createIndex({ userId: 1, secretId: 1, createdAt: -1 }),
    events.createIndex({ userId: 1, createdAt: -1 }),
    events.createIndex({ userId: 1, secretId: 1, createdAt: -1 }),
    events.createIndex({ projectId: 1, createdAt: -1 }),
    members.createIndex({ projectId: 1, userId: 1 }, { unique: true }),
    members.createIndex({ userId: 1 }),
  ]).catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function collections() {
  const db = getDb();
  const projects = db.collection<ProjectDoc>("projects");
  const secrets = db.collection<SecretDoc>("secrets");
  const versions = db.collection<SecretVersionDoc>("secret_versions");
  const events = db.collection<SecretEventDoc>("secret_events");
  const members = db.collection<ProjectMemberDoc>("project_members");
  await ensureIndexes(projects, secrets, versions, events, members);
  return { projects, secrets, versions, events, members };
}
