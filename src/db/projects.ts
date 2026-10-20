/**
 * Projects: the folders that group secrets. A project belongs to one owner and can be shared with other
 * people (see access.ts). Creating, renaming, deleting and sharing are owner-only: routes check that, and
 * these functions filter on the owner's `userId`, so nobody else's project can be touched by mistake.
 */
import type { ObjectId } from "mongodb";
import { LIMITS } from "@/modules/vault/constants";
import { accessibleProjects, projectAccess, type Actor, type Role } from "./access";
import { collections, keyOf, type ProjectDoc } from "./collections";
import { isDuplicateKeyError, LimitError, NameTakenError } from "./errors";
import { deleteSecrets } from "./secrets";
import { usersCollection } from "./users";

/** Safe to send to the browser. Dates are ISO strings so they survive JSON and server-to-client props. */
export type PublicProject = {
  id: string;
  name: string;
  description: string;
  secretCount: number;
  /** Your role in this project. */
  role: Role;
  ownerId: string;
  /** The owner's name when the project was shared with you, null when it is yours. */
  ownerName: string | null;
  /** How many other people it is shared with (only filled in for the owner). */
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

type Extras = { role: Role; secretCount: number; ownerName: string | null; memberCount: number };

const toPublic = (doc: ProjectDoc, extras: Extras): PublicProject => ({
  id: doc._id.toString(),
  name: doc.name,
  description: doc.description,
  ownerId: doc.userId.toString(),
  createdAt: doc.createdAt.toISOString(),
  updatedAt: doc.updatedAt.toISOString(),
  ...extras,
});

/** Every project you own or that was shared with you. */
export async function listProjects(actorId: ObjectId): Promise<PublicProject[]> {
  const { secrets, members } = await collections();
  const found = await accessibleProjects(actorId);
  const ids = found.map(({ doc }) => doc._id);
  const ownerIds = [...new Map(found.filter(({ role }) => role !== "owner").map(({ doc }) => [doc.userId.toString(), doc.userId])).values()];

  const [counts, memberCounts, owners] = await Promise.all([
    secrets.aggregate<{ _id: ObjectId; n: number }>([{ $match: { projectId: { $in: ids } } }, { $group: { _id: "$projectId", n: { $sum: 1 } } }]).toArray(),
    members.aggregate<{ _id: ObjectId; n: number }>([{ $match: { projectId: { $in: ids } } }, { $group: { _id: "$projectId", n: { $sum: 1 } } }]).toArray(),
    ownerIds.length ? usersCollection().then((users) => users.find({ _id: { $in: ownerIds } }, { projection: { name: 1 } }).toArray()) : [],
  ]);
  const secretsBy = new Map(counts.map((c) => [c._id.toString(), c.n]));
  const membersBy = new Map(memberCounts.map((c) => [c._id.toString(), c.n]));
  const ownerName = new Map(owners.map((u) => [u._id.toString(), u.name]));

  return found.map(({ doc, role }) =>
    toPublic(doc, {
      role,
      secretCount: secretsBy.get(doc._id.toString()) ?? 0,
      ownerName: role === "owner" ? null : (ownerName.get(doc.userId.toString()) ?? "Deleted user"),
      memberCount: role === "owner" ? (membersBy.get(doc._id.toString()) ?? 0) : 0,
    }),
  );
}

/** One project you can open (owned or shared), or null. */
export async function getProject(actorId: ObjectId, projectId: ObjectId): Promise<PublicProject | null> {
  const access = await projectAccess(actorId, projectId);
  if (!access) return null;
  return (await listProjects(actorId)).find((project) => project.id === projectId.toString()) ?? null;
}

/** Projects you can open. */
export async function countProjects(actorId: ObjectId): Promise<number> {
  return (await accessibleProjects(actorId)).length;
}

export async function createProject(userId: ObjectId, input: { name: string; description: string }): Promise<PublicProject> {
  const { projects } = await collections();
  if ((await projects.countDocuments({ userId })) >= LIMITS.projects) {
    throw new LimitError(`You can have up to ${LIMITS.projects} projects.`);
  }

  const now = new Date();
  const doc = { userId, name: input.name, nameKey: keyOf(input.name), description: input.description, createdAt: now, updatedAt: now };
  try {
    const { insertedId } = await projects.insertOne(doc as ProjectDoc);
    return toPublic({ ...doc, _id: insertedId }, { role: "owner", secretCount: 0, ownerName: null, memberCount: 0 });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new NameTakenError("You already have a project with that name.");
    throw error;
  }
}

/** Owner only. Returns null when the project doesn't exist (or isn't yours). */
export async function updateProject(
  userId: ObjectId,
  projectId: ObjectId,
  input: { name: string; description: string },
): Promise<PublicProject | null> {
  const { projects } = await collections();
  try {
    const doc = await projects.findOneAndUpdate(
      { _id: projectId, userId },
      { $set: { name: input.name, nameKey: keyOf(input.name), description: input.description, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    return doc ? ((await getProject(userId, projectId)) ?? null) : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new NameTakenError("You already have a project with that name.");
    throw error;
  }
}

/** Owner only. Deletes the project, everyone's access to it, and every secret inside. Null when it isn't yours. */
export async function deleteProject(userId: ObjectId, actor: Actor, projectId: ObjectId): Promise<{ deletedSecrets: number } | null> {
  const { projects, secrets, members } = await collections();
  const { deletedCount } = await projects.deleteOne({ _id: projectId, userId });
  if (!deletedCount) return null;
  await members.deleteMany({ projectId });
  const docs = await secrets.find({ userId, projectId }, { projection: { _id: 1 } }).toArray();
  return { deletedSecrets: await deleteSecrets(userId, actor, docs.map((doc) => doc._id)) };
}
