import { NextResponse } from "next/server";
import { projectAccess, writableSecretsByOwner } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { bulkUpdateSecrets, deleteSecrets, type BulkResult } from "@/db/secrets";
import { apiError, authorize, handleError, noStore, requireRole } from "@/lib/api-guard";
import { parseBulk } from "@/lib/vault-input";

// POST /api/vault/secrets/bulk
//   { action: "delete", ids }                                         ->  { deleted }
//   { action: "update", ids, projectId?, environment?, type? }        ->  { updated, failed: [{ id, name, error }] }
// Only secrets you may change (your own, or in projects where you are an editor) are touched. Any other id is
// ignored, like an id that doesn't exist.
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const parsed = parseBulk(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);
  const ids = parsed.data.ids.map(parseObjectId).filter((id) => id !== null);

  try {
    const groups = [...(await writableSecretsByOwner(auth.userId, ids)).values()];

    if (parsed.data.action === "delete") {
      let deleted = 0;
      for (const group of groups) deleted += await deleteSecrets(group.ownerId, auth.actor, group.ids);
      return NextResponse.json({ deleted }, { headers: noStore });
    }

    const projectId = parsed.data.projectId ? parseObjectId(parsed.data.projectId) : undefined;
    if (parsed.data.projectId && !projectId) return apiError("Project not found.", 404);
    if (projectId) {
      const target = await projectAccess(auth.userId, projectId);
      const denied = requireRole(target, "write", "Project not found.");
      if (denied || !target) return denied!;
      if (groups.some((group) => !group.ownerId.equals(target.ownerId))) {
        return apiError("Secrets can only be moved to a project with the same owner.", 400);
      }
    }

    const { environment, type } = parsed.data;
    const total: BulkResult = { updated: 0, failed: [] };
    for (const group of groups) {
      const result = await bulkUpdateSecrets(group.ownerId, auth.actor, group.ids, { environment, type, ...(projectId ? { projectId } : {}) });
      total.updated += result.updated;
      total.failed.push(...result.failed);
    }
    return NextResponse.json(total, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
