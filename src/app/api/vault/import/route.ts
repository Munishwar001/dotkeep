import { NextResponse } from "next/server";
import { projectAccess } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { importSecrets } from "@/db/secret-import";
import { apiError, authorize, handleError, noStore, requireRole } from "@/lib/api-guard";
import { parseEnv } from "@/lib/dotenv";
import { LIMITS } from "@/modules/vault/constants";
import { parseImport } from "@/lib/vault-input";
import { parseJsonVariables } from "@/lib/vault-json";

// POST /api/vault/import  { projectId, environment, content, format?, overwrite? }
//   ->  { created, updated, unchanged, skipped, failed: [{ name, error }], lineErrors: [{ line?, message }] }
// `content` is the text of a .env file, or of a JSON object like { "NAME": "value" } when `format` is "json". Variables that already exist in that project and environment are
// skipped, or have their value replaced (the old value stays in the history) when `overwrite` is true.
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const parsed = parseImport(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);
  const projectId = parseObjectId(parsed.data.projectId);
  if (!projectId) return apiError("Project not found.", 404);

  const json = parsed.data.format === "json";
  const env: { entries: { name: string; value: string }[]; errors: { line?: number; message: string }[] } = json
    ? parseJsonVariables(parsed.data.content)
    : parseEnv(parsed.data.content);
  if (!env.entries.length) {
    const first = env.errors[0];
    return apiError(first ? `No variables found. ${first.line ? `Line ${first.line}: ` : ""}${first.message}` : "No variables found in that file.", 400);
  }
  if (env.entries.length > LIMITS.importEntries) return apiError(`You can import up to ${LIMITS.importEntries} variables at once.`, 400);

  try {
    const access = await projectAccess(auth.userId, projectId);
    const denied = requireRole(access, "write", "Project not found.");
    if (denied || !access) return denied!;
    const result = await importSecrets(access.ownerId, auth.actor, { projectId, environment: parsed.data.environment, entries: env.entries, overwrite: parsed.data.overwrite, source: json ? "a JSON file" : "a .env file" });
    return result ? NextResponse.json({ ...result, lineErrors: env.errors }, { headers: noStore }) : apiError("Project not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
