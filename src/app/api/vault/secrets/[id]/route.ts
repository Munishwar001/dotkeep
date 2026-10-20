import { NextResponse } from "next/server";
import { parseObjectId } from "@/db/collections";
import { deleteSecret, updateSecret } from "@/db/secrets";
import { apiError, authorize, handleError, noStore } from "@/lib/api-guard";
import { parseSecretUpdate } from "@/lib/vault-input";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/vault/secrets/:id  { name?, environment?, type?, value? }  ->  only the fields you send change
export async function PATCH(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Secret not found.", 404);
  const parsed = parseSecretUpdate(await request.json().catch(() => null));
  if (!parsed.ok) return apiError(parsed.error, 400);

  try {
    const secret = await updateSecret(auth.userId, id, parsed.data);
    return secret ? NextResponse.json({ secret }, { headers: noStore }) : apiError("Secret not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/vault/secrets/:id
export async function DELETE(request: Request, { params }: Context) {
  const auth = await authorize(request, { mutating: true });
  if (auth instanceof Response) return auth;

  const id = parseObjectId((await params).id);
  if (!id) return apiError("Secret not found.", 404);

  try {
    return (await deleteSecret(auth.userId, id)) ? NextResponse.json({ ok: true }, { headers: noStore }) : apiError("Secret not found.", 404);
  } catch (error) {
    return handleError(error);
  }
}
