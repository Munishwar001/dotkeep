import { NextResponse } from "next/server";
import { exportBackup } from "@/db/vault-backup";
import { authorize, handleError, noStore, requireStepUp } from "@/lib/api-guard";
import { rateLimit } from "@/lib/request-guard";
import { serializeBackup } from "@/lib/vault-json";

// POST /api/vault/backup/export  ->  { content, projects, secrets }
// Every project you own, with all of its secrets decrypted, as one JSON file. It takes more values out than anything else,
// so it follows the same rules as the .env export: same-origin POST, the 2FA step-up, the shared rate limit, and one
// "exported" line in the activity log per secret. Projects shared with you are left out.
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

  try {
    const backup = await exportBackup(auth.userId, auth.actor);
    return NextResponse.json(
      { content: serializeBackup(backup.projects, new Date()), projects: backup.projects.length, secrets: backup.secretCount, encrypted: backup.encrypted },
      { headers: noStore },
    );
  } catch (error) {
    return handleError(error);
  }
}
