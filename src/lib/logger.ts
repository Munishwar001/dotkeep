/**
 * The one place server errors go. It prints a line to the console (JSON in production, readable in development)
 * and adds the error to the error record in MongoDB (src/db/server-errors.ts), which the admin page shows.
 *
 * To also send errors to an external service such as Sentry, call it from here: this is the only function
 * that needs to change. Messages are scrubbed first (see redact.ts).
 *
 * Never throws, so it is safe to call from a catch block.
 */
import { recordServerError } from "@/db/server-errors";
import { pathOnly, redact } from "./redact";

export type ErrorContext = {
  /** What was happening, e.g. "login", "vault api", "render". */
  source: string;
  route?: string;
  method?: string;
  path?: string;
};

function describe(error: unknown): { name: string; message: string; stack: string; digest?: string } {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  if (error instanceof Error) return { name: error.name, message: redact(error.message), stack: redact(error.stack ?? ""), digest };
  return { name: "NonError", message: redact(typeof error === "string" ? error : JSON.stringify(error) ?? String(error)), stack: "", digest };
}

export async function logError(error: unknown, context: ErrorContext | string): Promise<void> {
  try {
    const { source, route, method, path } = typeof context === "string" ? { source: context } as ErrorContext : context;
    const info = describe(error);
    const where = route ?? (path ? pathOnly(path) : undefined);

    if (process.env.NODE_ENV === "production") {
      console.error(JSON.stringify({ level: "error", time: new Date().toISOString(), source, route: where, method, digest: info.digest, name: info.name, message: info.message, stack: info.stack }));
    } else {
      console.error(`[${source}]${where ? ` ${method ?? ""} ${where}` : ""}`, info.stack || `${info.name}: ${info.message}`);
    }

    await recordServerError({ ...info, source, route: where, method });
  } catch {
    // Logging must never be the thing that fails.
  }
}
