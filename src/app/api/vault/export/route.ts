import { NextResponse } from "next/server";
import { projectAccess } from "@/db/access";
import { parseObjectId } from "@/db/collections";
import { exportSecrets } from "@/db/secret-import";
import { apiError, authorize, handleError, noStore, requireStepUp } from "@/lib/api-guard";
import { serializeEnv } from "@/lib/dotenv";
import { rateLimit } from "@/lib/request-guard";
import { parseExport } from "@/lib/vault-input";

// POST /api/vault/export  { projectId, environment }  ->  { content, count, skipped, projectName }
// Decrypts every secret of that project and environment into .env text. It is a POST (same-origin check) and
// rate limited, because it is the biggest way to take values out. Each exported secret is logged.
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;
  const stepUp = await requireStepUp(auth);
  if (stepUp) return stepUp;

  const limit = await rateLimit(`export:${auth.userId.toString()}`, 10, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many exports. Wait a moment and try again." },
      { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfter) } },
    );
  }

  const parsed = parseExport(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);
  const projectId = parseObjectId(parsed.data.projectId);
  if (!projectId) return apiError("Project not found.", 404);

  try {
    const access = await projectAccess(auth.userId, projectId);
    if (!access) return apiError("Project not found.", 404);
    const result = await exportSecrets(access.ownerId, auth.actor, { projectId, environment: parsed.data.environment });
    if (!result) return apiError("Project not found.", 404);
    return NextResponse.json(
      { content: serializeEnv(result.entries), count: result.entries.length, skipped: result.skipped, projectName: result.projectName },
      { headers: noStore },
    );
  } catch (error) {
    return handleError(error);
  }
}
