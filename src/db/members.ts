/**
 * Sharing a project with other people. Only the project's owner calls these (routes check the role first),
 * except removeMember, which a member may also use to leave a project.
 * People are found by the email of an existing, verified Dotkeep account.
 */
import { ObjectId } from "mongodb";
import { collections, type MemberRole } from "./collections";
import { isDuplicateKeyError, LimitError, NotFoundError } from "./errors";
import { findUserByEmail, isEmailVerified, usersCollection } from "./users";

export const MAX_MEMBERS = 20;

export type PublicMember = { userId: string; name: string; email: string; role: "owner" | MemberRole; createdAt: string };

/** The owner first, then the members by when they joined. */
export async function listMembers(ownerId: ObjectId, projectId: ObjectId): Promise<PublicMember[]> {
  const { projects, members } = await collections();
  const project = await projects.findOne({ _id: projectId, userId: ownerId }, { projection: { createdAt: 1 } });
  if (!project) return [];
  const docs = await members.find({ projectId }).sort({ createdAt: 1 }).toArray();
  const users = await usersCollection();
  const people = await users.find({ _id: { $in: [ownerId, ...docs.map((m) => m.userId)] } }, { projection: { name: 1, email: 1 } }).toArray();
  const byId = new Map(people.map((u) => [u._id.toString(), u]));
  const row = (userId: ObjectId, role: PublicMember["role"], createdAt: Date): PublicMember => ({
    userId: userId.toString(),
    name: byId.get(userId.toString())?.name ?? "Deleted user",
    email: byId.get(userId.toString())?.email ?? "",
    role,
    createdAt: createdAt.toISOString(),
  });
  return [row(ownerId, "owner", project.createdAt), ...docs.map((m) => row(m.userId, m.role, m.createdAt))];
}

/** Shares the project, or changes the role if the person already has access. */
export async function addMember(ownerId: ObjectId, projectId: ObjectId, input: { email: string; role: MemberRole }): Promise<PublicMember> {
  const { members } = await collections();
  const person = await findUserByEmail(input.email);
  if (!person || !isEmailVerified(person)) {
    throw new NotFoundError("There is no Dotkeep account with that email. Ask them to sign up and verify their email first.");
  }
  if (person._id.equals(ownerId)) throw new LimitError("You already own this project.");

  const existing = await members.findOne({ projectId, userId: person._id }, { projection: { _id: 1 } });
  if (!existing && (await members.countDocuments({ projectId })) >= MAX_MEMBERS) {
    throw new LimitError(`A project can be shared with up to ${MAX_MEMBERS} people.`);
  }

  const now = new Date();
  try {
    await members.updateOne(
      { projectId, userId: person._id },
      { $set: { role: input.role, ownerId }, $setOnInsert: { _id: new ObjectId(), createdAt: now } },
      { upsert: true },
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error; // two invites at once: the other one won, which is fine
  }
  return { userId: person._id.toString(), name: person.name, email: person.email, role: input.role, createdAt: now.toISOString() };
}

export async function setMemberRole(ownerId: ObjectId, projectId: ObjectId, userId: ObjectId, role: MemberRole): Promise<boolean> {
  const { members } = await collections();
  const { matchedCount } = await members.updateOne({ projectId, ownerId, userId }, { $set: { role } });
  return matchedCount > 0;
}

/** Removes someone's access. They keep nothing: from now on they get "not found" for the project and its secrets. */
export async function removeMember(projectId: ObjectId, userId: ObjectId): Promise<boolean> {
  const { members } = await collections();
  const { deletedCount } = await members.deleteOne({ projectId, userId });
  return deletedCount > 0;
}
