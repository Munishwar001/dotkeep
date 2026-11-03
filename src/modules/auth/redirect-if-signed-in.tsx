import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

/**
 * Put inside <Suspense> on pages meant for visitors (landing, login, signup): someone who is already signed in goes
 * straight to the dashboard. It checks the session in the database, not just the cookie, so an expired cookie
 * can't bounce between /login and /dashboard. The page itself stays static for everyone else.
 */
export async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/dashboard");
  return null;
}
