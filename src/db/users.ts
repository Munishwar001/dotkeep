/**
 * The `users` collection: what a user looks like in MongoDB, and the only functions that read or write it.
 *
 * Layers (each one talks only to the layer below it):
 *   API route  ->  src/db/users.ts  ->  src/lib/mongodb.ts  ->  MongoDB Atlas
 *
 * This file never hashes passwords and never sets cookies. It stores and finds documents, nothing else.
 * Callers pass in an already-hashed password (`passwordHash`), never the real one.
 */
import type { Collection, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { REVEAL_SECONDS } from "@/modules/vault/constants";
import { recordLoginEvent } from "./login-events";

/** One document in the `users` collection, exactly as it is stored. */
export type UserDoc = {
  _id: ObjectId; // MongoDB creates this automatically
  name: string;
  email: string; // always stored lowercase, see normalizeEmail()
  passwordHash: string; // the hash, never the real password
  createdAt: Date;
  // Added later. Older users don't have these fields, so everything reading them treats "missing" as the default.
  role?: Role; // missing = "user". Only the make-admin script can set "admin".
  lastLoginAt?: Date;
  loginCount?: number;
  revealSeconds?: number; // Settings -> Vault preference. Missing = REVEAL_SECONDS.
};

export type Role = "user" | "admin";

/** What the caller must provide to create a user. */
export type NewUser = { name: string; email: string; passwordHash: string };

/** A user that is safe to send to the browser: no password hash. */
export type PublicUser = { id: string; name: string; email: string; role: Role; revealSeconds: number; createdAt: Date };

/** Thrown by createUser() when the email is already registered. */
export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailTakenError";
  }
}

const COLLECTION_NAME = "users";

/** "Test@Mail.com " and "test@mail.com" are the same person, so always store the lowercase form. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Strips the password hash. Always use this before returning a user to the browser. */
export function toPublicUser(user: UserDoc): PublicUser {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role ?? "user", revealSeconds: user.revealSeconds ?? REVEAL_SECONDS, createdAt: user.createdAt };
}

// The unique index on `email` is what really stops two accounts with the same email, even if two
// signup requests arrive at the same moment. Creating it again is harmless, so this runs once per
// server start. If it fails (e.g. database unreachable) we forget the result and retry next time.
let indexReady: Promise<unknown> | null = null;

export async function usersCollection(): Promise<Collection<UserDoc>> {
  const users = getDb().collection<UserDoc>(COLLECTION_NAME);
  indexReady ??= users.createIndex({ email: 1 }, { unique: true }).catch((error) => {
    indexReady = null;
    throw error;
  });
  await indexReady;
  return users;
}

/** Saves a new user. Throws EmailTakenError if the email is already registered. */
export async function createUser(input: NewUser): Promise<UserDoc> {
  const users = await usersCollection();
  const doc = {
    name: input.name.trim(),
    email: normalizeEmail(input.email),
    passwordHash: input.passwordHash,
    role: "user" as Role, // nobody becomes admin through the website, see scripts/admin-role.mjs
    loginCount: 0,
    createdAt: new Date(),
  };

  try {
    const { insertedId } = await users.insertOne(doc as UserDoc);
    return { ...doc, _id: insertedId };
  } catch (error) {
    // 11000 is MongoDB's "duplicate key" error, raised by the unique email index.
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      throw new EmailTakenError();
    }
    throw error;
  }
}

/** Finds a user by email, or returns null. Used by login. */
export async function findUserByEmail(email: string): Promise<UserDoc | null> {
  const users = await usersCollection();
  return users.findOne({ email: normalizeEmail(email) });
}

/** Finds a user by id, or returns null. Used to turn a session into a user. */
export async function findUserById(id: ObjectId): Promise<UserDoc | null> {
  const users = await usersCollection();
  return users.findOne({ _id: id });
}

/**
 * Remembers that a user just logged in (also called after signup, which logs the user in).
 * It must never break a login, so a failure here is logged and swallowed.
 */
export async function recordLogin(userId: ObjectId): Promise<void> {
  try {
    const users = await usersCollection();
    const now = new Date();
    await users.updateOne({ _id: userId }, { $set: { lastLoginAt: now }, $inc: { loginCount: 1 } });
    await recordLoginEvent(userId, now);
  } catch (error) {
    console.error("could not record login", error);
  }
}
