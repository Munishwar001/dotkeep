/**
 * The error record: unexpected server errors, kept in MongoDB so an admin can see what broke without digging
 * through server logs. Identical errors (same type, message and place) are folded into one row with a counter.
 * Rows are deleted 30 days after they last happened (TTL index).
 *
 * Stored: error type, a redacted message, a redacted stack, where it happened (route and method, never the query
 * string), and Next's error digest. NOT stored: request headers, cookies, bodies, or who was logged in.
 * Writing to the record must never make things worse, so failures are swallowed (the logger still prints to the console).
 */
import { createHash } from "node:crypto";
import type { Collection, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

export const ERROR_RETENTION_DAYS = 30;

type ServerErrorDoc = {
  _id: ObjectId;
  fingerprint: string;
  name: string;
  message: string;
  stack: string;
  source: string;
  route: string | null;
  method: string | null;
  digest: string | null;
  count: number;
  firstAt: Date;
  lastAt: Date;
};

export type ServerErrorInput = {
  name: string;
  message: string; // already redacted
  stack: string; // already redacted
  source: string;
  route?: string;
  method?: string;
  digest?: string;
};

export type PublicServerError = {
  id: string;
  name: string;
  message: string;
  source: string;
  route: string | null;
  method: string | null;
  digest: string | null;
  count: number;
  firstAt: string;
  lastAt: string;
};

let indexesReady: Promise<unknown> | null = null;

async function errorsCollection(): Promise<Collection<ServerErrorDoc>> {
  const collection = getDb().collection<ServerErrorDoc>("server_errors");
  indexesReady ??= Promise.all([
    collection.createIndex({ fingerprint: 1 }, { unique: true }),
    collection.createIndex({ lastAt: -1 }),
    collection.createIndex({ lastAt: 1 }, { expireAfterSeconds: ERROR_RETENTION_DAYS * 24 * 60 * 60, name: "ttl_lastAt" }),
  ]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
  return collection;
}

export async function recordServerError(input: ServerErrorInput): Promise<void> {
  try {
    const collection = await errorsCollection();
    const fingerprint = createHash("sha1").update([input.name, input.message.split("\n")[0], input.source, input.route ?? ""].join("|")).digest("hex");
    const now = new Date();
    await collection.updateOne(
      { fingerprint },
      {
        $inc: { count: 1 },
        $set: { lastAt: now, stack: input.stack.slice(0, 4000), digest: input.digest ?? null, method: input.method ?? null },
        $setOnInsert: { fingerprint, name: input.name, message: input.message.slice(0, 500), source: input.source, route: input.route ?? null, firstAt: now },
      },
      { upsert: true },
    );
  } catch {
    // The database may be the very thing that is broken. The console line from the logger is the fallback.
  }
}

/** Newest first. For the admin page only. */
export async function listServerErrors(limit = 20): Promise<PublicServerError[]> {
  const collection = await errorsCollection();
  const docs = await collection.find({}).sort({ lastAt: -1 }).limit(limit).toArray();
  return docs.map((doc) => ({
    id: doc._id.toString(),
    name: doc.name,
    message: doc.message,
    source: doc.source,
    route: doc.route,
    method: doc.method,
    digest: doc.digest,
    count: doc.count,
    firstAt: doc.firstAt.toISOString(),
    lastAt: doc.lastAt.toISOString(),
  }));
}
