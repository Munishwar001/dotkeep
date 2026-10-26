/**
 * The `passwordResets` collection: one-time "reset your password" links.
 *
 * Built like email verification (see email-verifications.ts): the link carries a random token and the database
 * keeps only its SHA-256 hash. A link works once, and asking for a new one cancels the old one. Reset links are
 * more sensitive than verification links, so they expire after 1 hour instead of 24.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Collection, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

export const RESET_MINUTES = 60;
export const RESET_COOLDOWN_SECONDS = 60;

type ResetDoc = {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string; // sha256 of the token in the emailed link
  createdAt: Date;
  expiresAt: Date;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

let indexesReady: Promise<unknown> | null = null;

async function resetsCollection(): Promise<Collection<ResetDoc>> {
  const resets = getDb().collection<ResetDoc>("passwordResets");
  indexesReady ??= Promise.all([
    resets.createIndex({ tokenHash: 1 }, { unique: true }),
    resets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }), // MongoDB deletes expired links by itself
    resets.createIndex({ userId: 1 }),
  ]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
  return resets;
}

/** Makes a fresh reset token for a user, cancelling any older one. `{ cooldown }` = seconds to wait before asking again. */
export async function createPasswordReset(userId: ObjectId): Promise<{ token: string } | { cooldown: number }> {
  const resets = await resetsCollection();
  const now = Date.now();

  const newest = await resets.findOne({ userId }, { sort: { createdAt: -1 } });
  if (newest) {
    const wait = RESET_COOLDOWN_SECONDS - Math.floor((now - newest.createdAt.getTime()) / 1000);
    if (wait > 0) return { cooldown: wait };
  }

  await resets.deleteMany({ userId }); // older links stop working
  const token = randomBytes(32).toString("base64url");
  await resets.insertOne({
    userId,
    tokenHash: hashToken(token),
    createdAt: new Date(now),
    expiresAt: new Date(now + RESET_MINUTES * 60 * 1000),
  } as ResetDoc);
  return { token };
}

/** Drops every pending reset link of a user (the email could not be sent, or the password was just changed). */
export async function cancelPasswordResets(userId: ObjectId): Promise<void> {
  const resets = await resetsCollection();
  await resets.deleteMany({ userId });
}

/** Read-only check used when the link page opens. It does NOT use the token up. */
export async function isPasswordResetValid(token: string): Promise<boolean> {
  const resets = await resetsCollection();
  return (await resets.countDocuments({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } })) > 0;
}

/** Uses the token up. Returns whose password it resets, or null if it is unknown, expired, or already used. */
export async function consumePasswordReset(token: string): Promise<ObjectId | null> {
  const resets = await resetsCollection();
  // findOneAndDelete is atomic: two submissions at the same moment can't both succeed.
  const doc = await resets.findOneAndDelete({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!doc) return null;
  await resets.deleteMany({ userId: doc.userId });
  return doc.userId;
}
