import { appUrl } from "./mail";

/** The address Google sends people back to. It must match "Authorized redirect URIs" in the Google console exactly. */
export function googleRedirectUri(): string {
  return `${appUrl()}/api/auth/google/callback`;
}
