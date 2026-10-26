import type { Instrumentation } from "next";

/**
 * Next calls this for every error it catches on the server that the app didn't handle itself: a page that threw
 * while rendering, a route handler that crashed, a server action. Errors the app handles on purpose (a 404, a
 * validation message) never get here. It only runs on the Node runtime, where MongoDB is available.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError } = await import("@/lib/logger");
  await logError(error, { source: context.routeType, route: context.routePath, method: request.method, path: request.path });
};
