/**
 * The `loginEvents` collection: one tiny document per login, { userId, at }. It powers the admin
 * "logins per day" chart and "active users" numbers.
 *
 * Privacy: no IP address, no device, no location. Just which user and when. Events are deleted
 * automatically after 90 days (TTL index).
 */
import type { Collection, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

type LoginEventDoc = { _id: ObjectId; userId: ObjectId; at: Date };

const RETENTION_DAYS = 90;

let indexReady: Promise<unknown> | null = null;

export async function loginEventsCollection(): Promise<Collection<LoginEventDoc>> {
  const events = getDb().collection<LoginEventDoc>("loginEvents");
  indexReady ??= events.createIndex({ at: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 }).catch((error) => {
    indexReady = null;
    throw error;
  });
  await indexReady;
  return events;
}

export async function recordLoginEvent(userId: ObjectId, at: Date): Promise<void> {
  const events = await loginEventsCollection();
  await events.insertOne({ userId, at } as LoginEventDoc);
}
