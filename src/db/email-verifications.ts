/**
 * The `emailVerifications` collection: one-time "confirm your email" links.
 *
 * Same idea as sessions: the link carries a random token, and the database keeps only a SHA-256 hash
 * of it. A leaked database therefore can't be used to verify anyone's email. A token works once, expires
 * after 24 hours, and asking for a new link cancels the old one.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Collection, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

export const VERIFICATION_HOURS = 24;
export const RESEND_COOLDOWN_SECONDS = 60;

type VerificationDoc = {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string; // sha256 of the token in the emailed link
  createdAt: Date;
  expiresAt: Date;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// tokenHash is unique and makes lookups fast; expiresAt with expireAfterSeconds: 0 lets MongoDB delete
// expired links by itself; userId finds a person's links. "Create once, retry on failure" like the other collections.
let indexesReady: Promise<unknown> | null = null;

async function verificationsCollection(): Promise<Collection<VerificationDoc>> {
  const verifications = getDb().collection<VerificationDoc>("emailVerifications");
  indexesReady ??= Promise.all([
    verifications.createIndex({ tokenHash: 1 }, { unique: true }),
    verifications.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    verifications.createIndex({ userId: 1 }),
  ]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
  return verifications;
}

/**
 * Makes a fresh link token for a user, cancelling any older one. Returns `{ cooldown }` (seconds to wait)
 * if a link was created less than RESEND_COOLDOWN_SECONDS ago, so nobody can use us to flood an inbox.
 */
export async function createVerification(userId: ObjectId): Promise<{ token: string } | { cooldown: number }> {
  const verifications = await verificationsCollection();
  const now = Date.now();

  const newest = await verifications.findOne({ userId }, { sort: { createdAt: -1 } });
  if (newest) {
    const wait = RESEND_COOLDOWN_SECONDS - Math.floor((now - newest.createdAt.getTime()) / 1000);
    if (wait > 0) return { cooldown: wait };
  }

  await verifications.deleteMany({ userId }); // older links stop working
  const token = randomBytes(32).toString("base64url");
  await verifications.insertOne({
    userId,
    tokenHash: hashToken(token),
    createdAt: new Date(now),
    expiresAt: new Date(now + VERIFICATION_HOURS * 60 * 60 * 1000),
  } as VerificationDoc);
  return { token };
}

/** Drops every pending link of a user, e.g. when the email could not be sent, so they can ask again right away. */
export async function cancelVerifications(userId: ObjectId): Promise<void> {
  const verifications = await verificationsCollection();
  await verifications.deleteMany({ userId });
}

/** Read-only check used when the link page opens. It does NOT use the token up. */
export async function isVerificationValid(token: string): Promise<boolean> {
  const verifications = await verificationsCollection();
  return (await verifications.countDocuments({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } })) > 0;
}

/** Uses the token up. Returns whose email it confirms, or null if the token is unknown, expired, or already used. */
export async function consumeVerification(token: string): Promise<ObjectId | null> {
  const verifications = await verificationsCollection();
  // findOneAndDelete is atomic: two clicks at the same moment can't both succeed.
  const doc = await verifications.findOneAndDelete({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!doc) return null;
  await verifications.deleteMany({ userId: doc.userId });
  return doc.userId;
}
