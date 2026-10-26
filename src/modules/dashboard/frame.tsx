import { Suspense } from "react";
import { DashboardSkeleton } from "./overview";

/**
 * The page side of the dashboard layout (the sidebar itself lives in app/dashboard/layout.tsx).
 * The page content reads the session cookie (request-time data), so it goes inside a Suspense boundary.
 */
export function DashboardFrame({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<DashboardSkeleton />}>{children}</Suspense>;
}
