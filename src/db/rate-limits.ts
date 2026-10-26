/**
 * The `rateLimits` collection: one counter per key (e.g. `login:1.2.3.4:a@b.com`).
 *
 * It lives in MongoDB so the counters survive a server restart and are shared by every server instance.
 * Each counter is a fixed window: the first attempt starts it, and it resets once `resetAt` has passed.
 */
import type { Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";

type RateLimitDoc = {
  _id: string; // the limit key
  count: number;
  resetAt: Date; // when the window ends and the count starts over
  expiresAt: Date; // same moment; MongoDB deletes the document by itself afterwards
};

let indexesReady: Promise<unknown> | null = null;

async function rateLimitsCollection(): Promise<Collection<RateLimitDoc>> {
  const limits = getDb().collection<RateLimitDoc>("rateLimits");
  indexesReady ??= limits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
  return limits;
}

/** Counts one attempt for `key`. Returns the count including this attempt and when the window ends. */
async function hit(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }> {
  const limits = await rateLimitsCollection();
  const now = new Date();
  const newEnd = new Date(now.getTime() + windowMs);
  const windowOpen = { $and: [{ $eq: [{ $type: "$resetAt" }, "date"] }, { $gt: ["$resetAt", now] }] };

  // One atomic update (an aggregation pipeline), so two servers hitting the same key can't lose a count.
  // A missing or finished window starts again at 1; an open one just adds 1.
  const update = [
    {
      $set: {
        count: { $cond: [windowOpen, { $add: ["$count", 1] }, 1] },
        resetAt: { $cond: [windowOpen, "$resetAt", newEnd] },
        expiresAt: { $cond: [windowOpen, "$expiresAt", newEnd] },
      },
    },
  ];

  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await limits.findOneAndUpdate({ _id: key }, update, { upsert: true, returnDocument: "after" });
      return { count: doc!.count, resetAt: doc!.resetAt };
    } catch (error) {
      // Two first-ever attempts for a new key can race on the upsert; the loser just retries as an update.
      if ((error as { code?: number }).code === 11000 && attempt === 0) continue;
      throw error;
    }
  }
}

/** Allows `max` attempts per `windowMs` for a key. Returns how many seconds to wait when blocked. */
export async function consumeRateLimit(key: string, max: number, windowMs: number): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const { count, resetAt } = await hit(key, windowMs);
  if (count <= max) return { ok: true };
  return { ok: false, retryAfter: Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)) };
}
