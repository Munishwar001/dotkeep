/**
 * Two-step sign-in. Two things live here:
 *
 *  - The user's 2FA settings (on the `users` document): setup, confirm, check a code, turn off.
 *  - The `twoFactorChallenges` collection: "this browser has the right password and now owes a code".
 *
 * A challenge is made after the password (or Google) check passes. It is NOT a session: it opens nothing. Only
 * a correct code turns it into a real session. Like sessions, the browser holds a random token and we store its hash.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Collection, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, looksLikeRecoveryCode, verifyTotp } from "@/lib/totp";
import { decryptSecret, encryptSecret } from "@/lib/vault-crypto";
import { usersCollection, type UserDoc } from "./users";

// Bound to the user, so a stored secret copied onto another account refuses to decrypt.
const context = (userId: ObjectId) => `2fa:${userId.toString()}`;

/** Step 1 of turning it on: makes a fresh secret and keeps it as "pending" until a code from the app confirms it. */
export async function startTwoFactorSetup(userId: ObjectId): Promise<string | null> {
  const users = await usersCollection();
  const secret = generateTotpSecret();
  const { modifiedCount } = await users.updateOne(
    { _id: userId, twoFactor: { $exists: false } },
    { $set: { twoFactorPending: { secret: encryptSecret(secret, context(userId)), createdAt: new Date() } } },
  );
  return modifiedCount > 0 ? secret : null; // null: already on
}

/** Step 2: the code from the app proves the secret was scanned. Returns the recovery codes (shown once), or null if the code is wrong. */
export async function confirmTwoFactorSetup(user: UserDoc, code: string): Promise<string[] | null> {
  if (!user.twoFactorPending || user.twoFactor) return null;
  const secret = decryptSecret(user.twoFactorPending.secret, context(user._id));
  const step = verifyTotp(secret, code);
  if (step === null) return null;

  const recoveryCodes = generateRecoveryCodes();
  const users = await usersCollection();
  const { modifiedCount } = await users.updateOne(
    { _id: user._id, twoFactor: { $exists: false }, "twoFactorPending.secret": user.twoFactorPending.secret },
    {
      $set: { twoFactor: { secret: user.twoFactorPending.secret, enabledAt: new Date(), lastStep: step, recoveryHashes: recoveryCodes.map(hashRecoveryCode) } },
      $unset: { twoFactorPending: "" },
    },
  );
  return modifiedCount > 0 ? recoveryCodes : null;
}

/**
 * Checks the second factor: a 6-digit code from the app, or one of the recovery codes (each works once).
 * Both uses are atomic, so two requests with the same code can't both succeed.
 */
export async function verifySecondFactor(user: UserDoc, input: string): Promise<boolean> {
  const tf = user.twoFactor;
  if (!tf) return false;
  const users = await usersCollection();

  if (looksLikeRecoveryCode(input)) {
    const hash = hashRecoveryCode(input);
    const { modifiedCount } = await users.updateOne({ _id: user._id, "twoFactor.recoveryHashes": hash }, { $pull: { "twoFactor.recoveryHashes": hash } });
    return modifiedCount > 0;
  }

  const step = verifyTotp(decryptSecret(tf.secret, context(user._id)), input, tf.lastStep ?? -1);
  if (step === null) return false;
  // Only moves lastStep forward. If a parallel request already used this step (or a later one), this matches nothing.
  const { modifiedCount } = await users.updateOne(
    { _id: user._id, $or: [{ "twoFactor.lastStep": { $exists: false } }, { "twoFactor.lastStep": { $lt: step } }] },
    { $set: { "twoFactor.lastStep": step } },
  );
  return modifiedCount > 0;
}

/** Replaces the recovery codes with a new set (the old ones stop working). */
export async function regenerateRecoveryCodes(userId: ObjectId): Promise<string[]> {
  const users = await usersCollection();
  const codes = generateRecoveryCodes();
  await users.updateOne({ _id: userId, twoFactor: { $exists: true } }, { $set: { "twoFactor.recoveryHashes": codes.map(hashRecoveryCode) } });
  return codes;
}

/** Settings -> "Ask for a code before showing secrets". Only possible while 2FA is on. Returns false if it isn't. */
export async function setSecretsNeedCode(userId: ObjectId, on: boolean): Promise<boolean> {
  const users = await usersCollection();
  const { matchedCount } = await users.updateOne(
    { _id: userId, twoFactor: { $exists: true } },
    on ? { $set: { secretsNeedCode: true } } : { $unset: { secretsNeedCode: "" } },
  );
  return matchedCount > 0;
}

export async function disableTwoFactor(userId: ObjectId): Promise<void> {
  const users = await usersCollection();
  await users.updateOne({ _id: userId }, { $unset: { twoFactor: "", twoFactorPending: "", secretsNeedCode: "" } });
  await (await challengesCollection()).deleteMany({ userId });
}

// ---- Challenges ----

const CHALLENGE_MINUTES = 5;
export const MAX_CHALLENGE_ATTEMPTS = 5;

type ChallengeDoc = { _id: ObjectId; tokenHash: string; userId: ObjectId; attempts: number; expiresAt: Date };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

let indexesReady: Promise<unknown> | null = null;

async function challengesCollection(): Promise<Collection<ChallengeDoc>> {
  const challenges = getDb().collection<ChallengeDoc>("twoFactorChallenges");
  indexesReady ??= Promise.all([
    challenges.createIndex({ tokenHash: 1 }, { unique: true }),
    challenges.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
  return challenges;
}

/** Called after the password was right. Give `token` to the browser (cookie); it is only good for code attempts. */
export async function createChallenge(userId: ObjectId): Promise<{ token: string; expiresAt: Date }> {
  const challenges = await challengesCollection();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000);
  await challenges.insertOne({ tokenHash: hashToken(token), userId, attempts: 0, expiresAt } as ChallengeDoc);
  return { token, expiresAt };
}

/**
 * Counts one code attempt and returns the challenge's user, or null if the token is unknown, expired, or used up.
 * The count goes up BEFORE the code is checked, atomically, so guessing in parallel doesn't get extra tries. After
 * MAX_CHALLENGE_ATTEMPTS the challenge is deleted and the person has to enter the password again.
 */
export async function takeChallengeAttempt(token: string): Promise<ObjectId | null> {
  const challenges = await challengesCollection();
  const doc = await challenges.findOneAndUpdate({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }, { $inc: { attempts: 1 } }, { returnDocument: "after" });
  if (!doc) return null;
  if (doc.attempts > MAX_CHALLENGE_ATTEMPTS) {
    await challenges.deleteOne({ _id: doc._id });
    return null;
  }
  return doc.userId;
}

export async function deleteChallenge(token: string): Promise<void> {
  const challenges = await challengesCollection();
  await challenges.deleteOne({ tokenHash: hashToken(token) });
}
