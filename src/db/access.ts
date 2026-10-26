/**
 * Who may do what with a project and its secrets.
 *
 * - A project has ONE owner (its `userId`). The owner can do everything, including sharing and deleting.
 * - Others get a role on that project (project_members): "editor" can add, change, move and delete its
 *   secrets and import into it; "viewer" can only look (reveal, copy, export, read history).
 * - A secret always belongs to its project's owner (`secret.userId` is the owner), whoever created it. That
 *   keeps the encryption context (ownerId:secretId) stable, and sharing never touches the ciphertext.
 *
 * Routes call projectAccess()/secretAccess() with the logged-in user, check the role, then call the db
 * functions with `access.ownerId`. Someone with no access gets `null`, which routes answer with 404, the same
 * as for something that doesn't exist.
 */
import { ObjectId } from "mongodb";
import { collections, type ProjectDoc } from "./collections";

export type Role = "owner" | "editor" | "viewer";
export type Access = { ownerId: ObjectId; role: Role };
/** The person doing something. Written to the audit log. */
export type Actor = { id: ObjectId; name: string };

export const canWrite = (role: Role) => role !== "viewer";

export async function projectAccess(actorId: ObjectId, projectId: ObjectId): Promise<Access | null> {
  const { projects, members } = await collections();
  const project = await projects.findOne({ _id: projectId }, { projection: { userId: 1 } });
  if (!project) return null;
  if (project.userId.equals(actorId)) return { ownerId: project.userId, role: "owner" };
  const member = await members.findOne({ projectId, userId: actorId }, { projection: { role: 1 } });
  return member ? { ownerId: project.userId, role: member.role } : null;
}

export async function secretAccess(actorId: ObjectId, secretId: ObjectId): Promise<(Access & { projectId: ObjectId }) | null> {
  const { secrets } = await collections();
  const secret = await secrets.findOne({ _id: secretId }, { projection: { projectId: 1 } });
  if (!secret) return null;
  const access = await projectAccess(actorId, secret.projectId);
  return access ? { ...access, projectId: secret.projectId } : null;
}

/** Every project the user can open: their own and those shared with them, each with their role. */
export async function accessibleProjects(actorId: ObjectId): Promise<{ doc: ProjectDoc; role: Role }[]> {
  const { projects, members } = await collections();
  const memberships = await members.find({ userId: actorId }).toArray();
  const roleOf = new Map(memberships.map((m) => [m.projectId.toString(), m.role]));
  const docs = await projects.find({ $or: [{ userId: actorId }, { _id: { $in: memberships.map((m) => m.projectId) } }] }).sort({ updatedAt: -1 }).toArray();
  return docs.map((doc) => ({ doc, role: doc.userId.equals(actorId) ? "owner" : (roleOf.get(doc._id.toString()) ?? "viewer") }));
}

export async function accessibleProjectIds(actorId: ObjectId): Promise<ObjectId[]> {
  const { projects, members } = await collections();
  const [owned, memberships] = await Promise.all([
    projects.find({ userId: actorId }, { projection: { _id: 1 } }).toArray(),
    members.find({ userId: actorId }, { projection: { projectId: 1 } }).toArray(),
  ]);
  return [...owned.map((p) => p._id), ...memberships.map((m) => m.projectId)];
}

/**
 * Of the given secret ids, the ones the user may change (owner or editor of the project), grouped by the
 * owner whose data they are. Ids that don't exist or aren't changeable are left out without saying which.
 */
export async function writableSecretsByOwner(actorId: ObjectId, secretIds: ObjectId[]): Promise<Map<string, { ownerId: ObjectId; ids: ObjectId[] }>> {
  const { projects, secrets, members } = await collections();
  const docs = await secrets.find({ _id: { $in: secretIds } }, { projection: { projectId: 1, userId: 1 } }).toArray();
  const projectIds = [...new Set(docs.map((d) => d.projectId.toString()))].map((id) => new ObjectId(id));
  const [owned, editing] = await Promise.all([
    projects.find({ _id: { $in: projectIds }, userId: actorId }, { projection: { _id: 1 } }).toArray(),
    members.find({ projectId: { $in: projectIds }, userId: actorId, role: "editor" }, { projection: { projectId: 1 } }).toArray(),
  ]);
  const writable = new Set([...owned.map((p) => p._id.toString()), ...editing.map((m) => m.projectId.toString())]);

  const groups = new Map<string, { ownerId: ObjectId; ids: ObjectId[] }>();
  for (const doc of docs) {
    if (!writable.has(doc.projectId.toString())) continue;
    const key = doc.userId.toString();
    const group = groups.get(key) ?? { ownerId: doc.userId, ids: [] };
    group.ids.push(doc._id);
    groups.set(key, group);
  }
  return groups;
}
