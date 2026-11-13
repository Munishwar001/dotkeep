import { DashShell } from "@/modules/dashboard/shell";
import { Sidebar } from "@/modules/dashboard/sidebar";
import { UnlockDialog } from "@/modules/e2ee/unlock-dialog";
import { StepUpDialog } from "@/modules/vault/step-up-dialog";

// Every dashboard page depends on the session and the database, so there is nothing worth prefetching. Without this,
// each visible link triggers a server render that runs queries during a prerender, which Next rejects.
export const prefetch = "force-disabled";

// The sidebar lives here, not in each page, so it isn't rebuilt on every navigation inside the dashboard.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <DashShell sidebar={<Sidebar />}>
      {children}
      <StepUpDialog />
      <UnlockDialog />
    </DashShell>
  );
}
