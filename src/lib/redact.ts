/**
 * Scrubs text before it is logged or stored in the error record. Error messages sometimes carry things nobody
 * should read later: an email address (mail errors), a password inside a connection string (database errors),
 * or a one-time token inside a URL. Pure and dependency-free, so it is unit-tested directly.
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const TOKEN_PARAM = /([?&](?:token|code|key|secret|password|sig|signature)=)[^&\s"']+/gi;

export function redact(text: string): string {
  return text.replace(URL_CREDENTIALS, "$1***@").replace(TOKEN_PARAM, "$1***").replace(EMAIL, "[email]");
}

/** A path without its query string: `/verify-email?token=abc` -> `/verify-email`. */
export const pathOnly = (path: string) => path.split("?")[0].split("#")[0];
