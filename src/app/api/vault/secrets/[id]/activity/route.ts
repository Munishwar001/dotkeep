import { NextResponse } from "next/server";
import { parseObjectId } from "@/db/collections";
import { listEvents } from "@/db/secret-events";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";

type Context = { params: Promise<{ id: string }> };

// GET /api/vault/secrets/:id/activity  ->  { events }: who did what to this secret and when, newest first.
// Covers your own projects and those shared with you, works for deleted secrets too (the log outlives them),
// and never returns events of projects you can't open.
export async function GET(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: false });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Secret not found.", 404);

  try {
    return NextResponse.json({ events: await listEvents(auth.userId, { secretId: id, limit: 100 }) }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
