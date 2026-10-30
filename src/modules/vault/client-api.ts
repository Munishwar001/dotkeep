/** Browser-side helper for the vault API. Never throws: it always returns { ok, data } or { ok, error }. */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/**
 * Accounts with 2FA must enter a code before secret values come out (reveal, export). The server then answers
 * 403 `step_up_required`. The StepUpDialog registers a function here that asks for the code; api() calls it and,
 * if the code was accepted, repeats the request once. Callers never have to know about any of this.
 */
let askForCode: (() => Promise<boolean>) | null = null;
export const registerStepUp = (handler: (() => Promise<boolean>) | null) => {
  askForCode = handler;
};

async function send<T>(method: "POST" | "PATCH" | "DELETE", url: string, body: unknown, canRetry: boolean): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" }, // the server requires JSON from our own site (CSRF protection)
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: data as T };
    const failure = data as { error?: string; code?: string } | null;
    if (response.status === 403 && failure?.code === "step_up_required" && canRetry && askForCode) {
      if (await askForCode()) return send<T>(method, url, body, false);
      return { ok: false, error: "Verification was cancelled.", code: "step_up_cancelled" };
    }
    if (response.status === 401) window.location.reload(); // session expired: the page sends you to /login
    return { ok: false, error: failure?.error ?? "Something went wrong. Please try again.", code: failure?.code };
  } catch {
    return { ok: false, error: "We couldn’t reach the server. Check your connection and try again." };
  }
}

export function api<T = unknown>(method: "POST" | "PATCH" | "DELETE", url: string, body: unknown = {}): Promise<ApiResult<T>> {
  return send<T>(method, url, body, true);
}

/** GET version of api(). Used for the history and activity lists. */
export async function apiGet<T = unknown>(url: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: data as T };
    if (response.status === 401) window.location.reload();
    return { ok: false, error: (data as { error?: string } | null)?.error ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, error: "We couldn’t reach the server. Check your connection and try again." };
  }
}
