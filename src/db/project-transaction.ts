import type { ClientSession, ObjectId } from "mongodb";
import { getMongoClient } from "@/lib/mongodb";
import { collections } from "./collections";
import { NotFoundError } from "./errors";

/** Transactions require a replica set (including Atlas). Never fall back to non-atomic writes. */
export async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  await collections(); // build indexes before entering a transaction
  return getMongoClient().withSession((session) => session.withTransaction(() => work(session)));
}

/** A real write forces competing membership, migration and secret writes to retry their snapshot. */
export async function guardProject(userId: ObjectId, projectId: ObjectId, session: ClientSession) {
  const { projects } = await collections();
  const result = await projects.updateOne({ _id: projectId, userId }, { $inc: { writeRevision: 1 } }, { session });
  if (!result.matchedCount) throw new NotFoundError("Project not found.");
}
