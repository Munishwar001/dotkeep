/** Browser-side helper for the vault API. Never throws: it always returns { ok, data } or { ok, error }. */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function api<T = unknown>(method: "POST" | "PATCH" | "DELETE", url: string, body: unknown = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" }, // the server requires JSON from our own site (CSRF protection)
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: data as T };
    if (response.status === 401) window.location.reload(); // session expired: the page sends you to /login
    return { ok: false, error: (data as { error?: string } | null)?.error ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, error: "We couldn’t reach the server. Check your connection and try again." };
  }
}
