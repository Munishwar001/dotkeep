import { Suspense } from "react";
import { Sidebar, type NavKey } from "./sidebar";
import { DashboardSkeleton } from "./overview";

/**
 * The shared dashboard layout: sidebar on the left, content on the right.
 * The sidebar doesn't depend on the user, so it stays in the static shell. The page content
 * reads the session cookie (request-time data), so it goes inside a Suspense boundary.
 */
export function DashboardFrame({ active, children }: { active: NavKey; children: React.ReactNode }) {
  return (
    <div className="dash">
      <Sidebar active={active} />
      <div className="dash-body">
        <Suspense fallback={<DashboardSkeleton />}>{children}</Suspense>
      </div>
    </div>
  );
}
