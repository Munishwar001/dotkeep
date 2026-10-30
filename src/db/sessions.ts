/**
 * The `sessions` collection: "this browser is logged in as that user".
 *
 * How it works:
 *  1. On login we make a random token and give it to the browser as a cookie.
 *  2. In the database we store only a SHA-256 hash of the token, never the token itself.
 *     So even if the database leaks, nobody can use it to pretend to be a logged-in user.
 *  3. On every request the cookie token is hashed again and looked up here.
 *
 * Each session also keeps a short `label` like "Chrome on Windows" so Settings can show where you are
 * logged in. No IP address and no raw User-Agent are stored.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Collection, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { findUserById, isBlocked, type UserDoc } from "./users";

export const SESSION_DAYS = 7;
/** How long one correct code keeps secret values available before the next one is asked for. */
export const STEP_UP_MINUTES = 10;

type SessionDoc = {
  _id: ObjectId;
  tokenHash: string; // sha256 of the cookie token
  userId: ObjectId;
  label?: string; // e.g. "Chrome on Windows". Older sessions don't have one.
  // Accounts with 2FA must re-enter a code before secret values come out (see requireStepUp). Until this moment the
  // session counts as "recently verified". Missing = not verified, so a session left open must prove itself again.
  stepUpUntil?: Date;
  createdAt: Date;
  expiresAt: Date;
};

const COLLECTION_NAME = "sessions";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Two indexes: tokenHash is unique and makes lookups fast; expiresAt with expireAfterSeconds: 0 is a
// TTL index, so MongoDB deletes expired sessions by itself. Same "create once, retry on failure" idea as users.ts.
let indexesReady: Promise<unknown> | null = null;

export async function sessionsCollection(): Promise<Collection<SessionDoc>> {
  const sessions = getDb().collection<SessionDoc>(COLLECTION_NAME);
  indexesReady ??= Promise.all([
    sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
  return sessions;
}

const stepUpEnd = (now: Date) => new Date(now.getTime() + STEP_UP_MINUTES * 60 * 1000);

/**
 * Creates a session for a user. Give `token` to the browser as a cookie; it is not stored anywhere else.
 * `verified` is for a sign-in that just passed a 2FA code: that code already proved the person, so don't ask again at once.
 */
export async function createSession(userId: ObjectId, label?: string, options: { verified?: boolean } = {}): Promise<{ token: string; expiresAt: Date }> {
  const sessions = await sessionsCollection();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sessions.insertOne({ tokenHash: hashToken(token), userId, label, createdAt: now, expiresAt, ...(options.verified ? { stepUpUntil: stepUpEnd(now) } : {}) } as SessionDoc);
  return { token, expiresAt };
}

/** Marks this session as just verified with a 2FA code. */
export async function markStepUp(token: string): Promise<void> {
  const sessions = await sessionsCollection();
  await sessions.updateOne({ tokenHash: hashToken(token) }, { $set: { stepUpUntil: stepUpEnd(new Date()) } });
}

/** True while this session's last 2FA code is recent enough. */
export async function hasRecentStepUp(token: string): Promise<boolean> {
  const sessions = await sessionsCollection();
  const now = new Date();
  return (await sessions.countDocuments({ tokenHash: hashToken(token), expiresAt: { $gt: now }, stepUpUntil: { $gt: now } })) > 0;
}

/** Returns the logged-in user for a cookie token, or null if the token is unknown or expired. */
export async function findUserBySessionToken(token: string): Promise<UserDoc | null> {
  const sessions = await sessionsCollection();
  // The TTL cleanup runs only about once a minute, so we also check expiry ourselves.
  const session = await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await findUserById(session.userId);
  return user && !isBlocked(user) ? user : null; // blocked users are logged out even if a session survived
}

/** Logs out: deletes the session so the cookie stops working everywhere. */
export async function deleteSession(token: string): Promise<void> {
  const sessions = await sessionsCollection();
  await sessions.deleteOne({ tokenHash: hashToken(token) });
}

/** What Settings shows for each place you're logged in. Never includes the token or its hash. */
export type PublicSession = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  current: boolean; // true for the session making this request
};

export async function listSessions(userId: ObjectId, currentToken: string | undefined): Promise<PublicSession[]> {
  const sessions = await sessionsCollection();
  const currentHash = currentToken ? hashToken(currentToken) : null;
  const docs = await sessions.find({ userId, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).toArray();
  return docs.map((doc) => ({
    id: doc._id.toString(),
    label: doc.label ?? "Unknown device",
    createdAt: doc.createdAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
    current: doc.tokenHash === currentHash,
  }));
}

/** Ends one of YOUR sessions by id. Returns false if it doesn't exist or isn't yours. */
export async function revokeSession(userId: ObjectId, sessionId: ObjectId): Promise<boolean> {
  const sessions = await sessionsCollection();
  const { deletedCount } = await sessions.deleteOne({ _id: sessionId, userId });
  return deletedCount > 0;
}

/** Ends every session of the user except the one making this request. Returns how many were ended. */
export async function revokeOtherSessions(userId: ObjectId, currentToken: string | undefined): Promise<number> {
  const sessions = await sessionsCollection();
  const keep = currentToken ? { tokenHash: { $ne: hashToken(currentToken) } } : {};
  const { deletedCount } = await sessions.deleteMany({ userId, ...keep });
  return deletedCount;
}

/** Ends every session of the user, everywhere. */
export async function deleteAllSessions(userId: ObjectId): Promise<void> {
  const sessions = await sessionsCollection();
  await sessions.deleteMany({ userId });
}
