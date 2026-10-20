/**
 * Projects: the folders that group secrets. Every function takes the owner's `userId` and filters on it,
 * so one user can never read or change another user's projects.
 */
import type { ObjectId } from "mongodb";
import { LIMITS } from "@/modules/vault/constants";
import { collections, keyOf, type ProjectDoc } from "./collections";
import { isDuplicateKeyError, LimitError, NameTakenError } from "./errors";

/** Safe to send to the browser. Dates are ISO strings so they survive JSON and server-to-client props. */
export type PublicProject = {
  id: string;
  name: string;
  description: string;
  secretCount: number;
  createdAt: string;
  updatedAt: string;
};

const toPublic = (doc: ProjectDoc, secretCount: number): PublicProject => ({
  id: doc._id.toString(),
  name: doc.name,
  description: doc.description,
  secretCount,
  createdAt: doc.createdAt.toISOString(),
  updatedAt: doc.updatedAt.toISOString(),
});

export async function listProjects(userId: ObjectId): Promise<PublicProject[]> {
  const { projects, secrets } = await collections();
  const [docs, counts] = await Promise.all([
    projects.find({ userId }).sort({ updatedAt: -1 }).toArray(),
    secrets.aggregate<{ _id: ObjectId; n: number }>([{ $match: { userId } }, { $group: { _id: "$projectId", n: { $sum: 1 } } }]).toArray(),
  ]);
  const perProject = new Map(counts.map((c) => [c._id.toString(), c.n]));
  return docs.map((doc) => toPublic(doc, perProject.get(doc._id.toString()) ?? 0));
}

export async function getProject(userId: ObjectId, projectId: ObjectId): Promise<PublicProject | null> {
  const { projects, secrets } = await collections();
  const doc = await projects.findOne({ _id: projectId, userId });
  if (!doc) return null;
  return toPublic(doc, await secrets.countDocuments({ userId, projectId }));
}

export async function countProjects(userId: ObjectId): Promise<number> {
  const { projects } = await collections();
  return projects.countDocuments({ userId });
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
    return toPublic({ ...doc, _id: insertedId }, 0);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new NameTakenError("You already have a project with that name.");
    throw error;
  }
}

/** Returns null when the project doesn't exist (or isn't yours). */
export async function updateProject(
  userId: ObjectId,
  projectId: ObjectId,
  input: { name: string; description: string },
): Promise<PublicProject | null> {
  const { projects, secrets } = await collections();
  try {
    const doc = await projects.findOneAndUpdate(
      { _id: projectId, userId },
      { $set: { name: input.name, nameKey: keyOf(input.name), description: input.description, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    return doc ? toPublic(doc, await secrets.countDocuments({ userId, projectId })) : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new NameTakenError("You already have a project with that name.");
    throw error;
  }
}

/** Deletes the project and every secret inside it. Returns null when it doesn't exist (or isn't yours). */
export async function deleteProject(userId: ObjectId, projectId: ObjectId): Promise<{ deletedSecrets: number } | null> {
  const { projects, secrets } = await collections();
  const { deletedCount } = await projects.deleteOne({ _id: projectId, userId });
  if (!deletedCount) return null;
  const result = await secrets.deleteMany({ userId, projectId });
  return { deletedSecrets: result.deletedCount };
}
