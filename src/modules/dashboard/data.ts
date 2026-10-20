import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import type { PublicUser } from "@/db/users";
import { isMongoConfigured } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/session";
import { isVaultConfigured } from "@/lib/vault-crypto";

/** For dashboard pages: the logged-in user (as an object id too), or a redirect to /login. */
export async function requireUser(): Promise<{ user: PublicUser; userId: ObjectId }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { user, userId: new ObjectId(user.id) };
}

/** Which environment variables are missing, so a page can say exactly what to set. */
export function missingVaultConfig(): string[] {
  const missing: string[] = [];
  if (!isMongoConfigured) missing.push("MONGODB_URI");
  if (!isVaultConfigured) missing.push("VAULT_ENCRYPTION_KEY");
  return missing;
}
