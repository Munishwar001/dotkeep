import { Sidebar } from "@/modules/dashboard/sidebar";
import { StepUpDialog } from "@/modules/vault/step-up-dialog";

// Every dashboard page depends on the session and the database, so there is nothing worth prefetching. Without this,
// each visible link triggers a server render that runs queries during a prerender, which Next rejects.
export const prefetch = "force-disabled";

// The sidebar lives here, not in each page, so it isn't rebuilt on every navigation inside the dashboard.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="dash">
      <Sidebar />
      <div className="dash-body">{children}</div>
      <StepUpDialog />
    </div>
  );
}
