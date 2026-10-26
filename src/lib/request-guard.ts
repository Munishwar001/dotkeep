/** Small protections shared by the auth API routes. */
import { consumeRateLimit } from "@/db/rate-limits";

/**
 * CSRF protection: only accept requests that came from our own site, as JSON.
 * Browsers always send the `Origin` header on POST, and a cross-site <form> can't send JSON.
 */
export function isSameOriginJson(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    if (new URL(origin).host !== host) return false;
  } catch {
    return false;
  }
  return (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Allows `max` attempts per `windowMs` for a key. Returns how many seconds to wait when blocked.
 * The counters are stored in MongoDB (see db/rate-limits.ts), so they survive restarts and are shared between servers.
 */
export function rateLimit(key: string, max: number, windowMs: number): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  return consumeRateLimit(key, max, windowMs);
}
