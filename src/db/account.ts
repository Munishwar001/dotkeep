/**
 * Changes a user makes to their own account (Settings). Every function takes the user's own `userId`.
 */
import type { ObjectId } from "mongodb";
import { REVEAL_OPTIONS } from "@/modules/vault/constants";
import { collections } from "./collections";
import { loginEventsCollection } from "./login-events";
import { sessionsCollection } from "./sessions";
import { usersCollection } from "./users";

export async function updateName(userId: ObjectId, name: string): Promise<boolean> {
  const users = await usersCollection();
  const { matchedCount } = await users.updateOne({ _id: userId }, { $set: { name } });
  return matchedCount > 0;
}

export async function updatePasswordHash(userId: ObjectId, passwordHash: string): Promise<void> {
  const users = await usersCollection();
  await users.updateOne({ _id: userId }, { $set: { passwordHash } });
}

export async function updateRevealSeconds(userId: ObjectId, seconds: number): Promise<boolean> {
  if (!(REVEAL_OPTIONS as readonly number[]).includes(seconds)) throw new RangeError("Unsupported reveal time.");
  const users = await usersCollection();
  const { matchedCount } = await users.updateOne({ _id: userId }, { $set: { revealSeconds: seconds } });
  return matchedCount > 0;
}

/**
 * Deletes the account and everything that belongs to it: sessions, secrets, projects, login events, and
 * finally the user. The user goes last, so if something fails halfway the person can still log in and retry.
 * An admin who is the only admin is refused, so the admin page is never left without anyone to open it.
 */
export async function deleteAccount(userId: ObjectId): Promise<{ ok: true } | { ok: false; reason: "not-found" | "last-admin" }> {
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId }, { projection: { role: 1 } });
  if (!user) return { ok: false, reason: "not-found" };
  if (user.role === "admin" && (await users.countDocuments({ role: "admin" })) <= 1) return { ok: false, reason: "last-admin" };

  const [{ projects, secrets }, sessions, events] = await Promise.all([collections(), sessionsCollection(), loginEventsCollection()]);
  await sessions.deleteMany({ userId });
  await secrets.deleteMany({ userId });
  await projects.deleteMany({ userId });
  await events.deleteMany({ userId });
  await users.deleteOne({ _id: userId });
  return { ok: true };
}
