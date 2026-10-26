import { Sidebar } from "@/modules/dashboard/sidebar";

// The sidebar lives here, not in each page, so it isn't rebuilt on every navigation inside the dashboard.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="dash">
      <Sidebar />
      <div className="dash-body">{children}</div>
    </div>
  );
}
