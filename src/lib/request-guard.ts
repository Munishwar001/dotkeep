/** Small protections shared by the auth API routes. */

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

// In-memory attempt counter. It stops simple password guessing, but it resets when the server restarts
// and isn't shared between servers. If you run more than one server, move this into MongoDB or Redis.
type Bucket = { count: number; resetAt: number };
declare global {
  var __dotkeepRateBuckets: Map<string, Bucket> | undefined;
}
const buckets = (globalThis.__dotkeepRateBuckets ??= new Map<string, Bucket>());

/** Allows `max` attempts per `windowMs` for a key. Returns how many seconds to wait when blocked. */
export function rateLimit(key: string, max: number, windowMs: number): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k); // drop old entries

  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= max) return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  bucket.count += 1;
  return { ok: true };
}
