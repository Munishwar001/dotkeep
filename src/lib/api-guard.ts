import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { LimitError, NameTakenError } from "@/db/errors";
import { isMongoConfigured } from "./mongodb";
import { isSameOriginJson } from "./request-guard";
import { getCurrentUser } from "./session";
import { isVaultConfigured } from "./vault-crypto";

export const noStore = { "Cache-Control": "no-store" };

export const apiError = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

/**
 * Every vault API route starts here. Returns the logged-in user's id, or a ready-made error Response:
 * 403 for requests that didn't come from our own site, 503 if the server isn't set up, 401 if not logged in.
 * Callers do:  const auth = await authorize(...);  if (auth instanceof Response) return auth;
 */
export async function authorize(request: Request, options: { mutating: boolean }): Promise<{ userId: ObjectId } | Response> {
  if (options.mutating && !isSameOriginJson(request)) return apiError("Invalid request.", 403);
  if (!isMongoConfigured) return apiError("The database isn’t configured. Set MONGODB_URI in .env.local.", 503);
  if (!isVaultConfigured) return apiError("The vault isn’t configured. Set VAULT_ENCRYPTION_KEY in .env.local.", 503);

  const user = await getCurrentUser();
  if (!user) return apiError("Please sign in again.", 401);
  return { userId: new ObjectId(user.id) };
}

/** Turns expected database errors into friendly responses. Anything else is logged and becomes a 500. */
export function handleError(error: unknown): Response {
  if (error instanceof NameTakenError) return apiError(error.message, 409);
  if (error instanceof LimitError) return apiError(error.message, 422);
  console.error("vault api error", error);
  return apiError("Something went wrong. Please try again.", 500);
}
