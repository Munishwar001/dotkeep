import { NextResponse } from "next/server";
import { importBackup } from "@/db/vault-backup";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { environmentOf, parseBackupImport, typeOf } from "@/lib/vault-input";
import { parseBackup } from "@/lib/vault-json";
import { LIMITS } from "@/modules/vault/constants";

// POST /api/vault/backup/import  { content, overwrite? }
//   ->  { projectsCreated, created, updated, unchanged, skipped, failed: [{ name, error }], issues: [string] }
// `content` is a backup file made by /api/vault/backup/export. Projects are matched by name (missing ones are created) and
// go into your own vault. Secrets that already exist (same project, name and environment) are skipped, or have their
// value replaced (the old value stays in the history) when `overwrite` is true. Lines of the file that can't be read are in `issues`.
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const parsed = parseBackupImport(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  const backup = parseBackup(parsed.data.content, { environment: environmentOf, type: typeOf });
  if (!backup.ok) return apiError(backup.error, 400);
  const count = backup.projects.reduce((sum, project) => sum + project.secrets.length, 0);
  if (!count) return apiError(backup.errors[0] ? `No secrets found. ${backup.errors[0]}` : "No secrets found in that file.", 400);
  if (count > LIMITS.secrets) return apiError(`A backup can hold up to ${LIMITS.secrets} secrets.`, 400);

  try {
    const result = await importBackup(auth.userId, auth.actor, backup.projects, parsed.data.overwrite);
    return NextResponse.json({ ...result, issues: backup.errors }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
