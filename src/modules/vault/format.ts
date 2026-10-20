/** Same date everywhere, on the server and in the browser (UTC), so there is no hydration mismatch. */
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" });
}
