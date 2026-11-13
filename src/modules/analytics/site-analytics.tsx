"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

// Only these public pages are counted. Anything else (the dashboard, reset and verify links that carry a token, API routes) is
// dropped before it leaves the browser, so a new page is not tracked unless it is added here on purpose.
const PUBLIC_PATHS = new Set(["/", "/docs", "/privacy", "/terms", "/login", "/signup", "/forgot-password"]);

function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  if (!PUBLIC_PATHS.has(path)) return null;
  url.search = ""; // never send a query string
  url.hash = "";
  return { ...event, url: url.toString() };
}

/** Anonymous page views for the public pages, from Vercel Web Analytics. It sets no cookie. */
export function SiteAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
