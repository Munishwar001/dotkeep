/**
 * The `projects` and `secrets` collections: document shapes plus the collection handles.
 * Both collections are only ever read or written through src/db/projects.ts and src/db/secrets.ts.
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

/** Turns a string from a URL into an ObjectId, or null. (ObjectId.isValid alone accepts any 12-char string.) */
export function parseObjectId(value: string | undefined | null): ObjectId | null {
  return value && /^[0-9a-f]{24}$/i.test(value) ? new ObjectId(value) : null;
}

export const keyOf = (name: string) => name.trim().toLowerCase();

// Indexes are created once per server start (creating them again is harmless). On failure we retry next time.
let ready: Promise<unknown> | null = null;

function ensureIndexes(projects: Collection<ProjectDoc>, secrets: Collection<SecretDoc>) {
  ready ??= Promise.all([
    projects.createIndex({ userId: 1, nameKey: 1 }, { unique: true }), // one project name per user
    projects.createIndex({ userId: 1, updatedAt: -1 }),
    // the same secret name is fine in different environments (DATABASE_URL in local and in production)
    secrets.createIndex({ userId: 1, projectId: 1, environment: 1, nameKey: 1 }, { unique: true }),
    secrets.createIndex({ userId: 1, updatedAt: -1 }),
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
  await ensureIndexes(projects, secrets);
  return { projects, secrets };
}
