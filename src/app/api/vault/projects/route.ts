import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/db/projects";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { parseProject } from "@/lib/vault-input";

// GET /api/vault/projects  ->  your projects
export async function GET(request: Request) {
  const auth = await authorize(request, { mutating: false });
  if (auth instanceof Response) return auth;
  try {
    return NextResponse.json({ projects: await listProjects(auth.userId) }, { headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/vault/projects  { name, description? }  ->  creates a project
export async function POST(request: Request) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const parsed = parseProject(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);
  try {
    return NextResponse.json({ project: await createProject(auth.userId, parsed.data) }, { status: 201, headers: noStore });
  } catch (error) {
    return handleError(error);
  }
}
