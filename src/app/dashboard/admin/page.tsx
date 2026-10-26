import type { Metadata } from "next";
import { getAdminStats, listAdminUsers } from "@/db/admin";
import { listServerErrors } from "@/db/server-errors";
import { LoginsChart, StatTiles, UsersTable } from "@/modules/admin/admin-view";
import { ServerErrors } from "@/modules/admin/server-errors";
import { requireAdmin } from "@/modules/dashboard/data";
import { DashboardFrame } from "@/modules/dashboard/frame";
import { Topbar } from "@/modules/dashboard/overview";
import { PageHeader } from "@/modules/dashboard/page-header";

export const metadata: Metadata = {
  title: "Admin — Dotkeep",
  robots: { index: false },
};

type SearchParams = Promise<{ q?: string; page?: string }>;

// `searchParams` and the session are request-time data, so this runs inside the Suspense boundary from DashboardFrame.
async function AdminContent({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAdmin(); // non-admins get "not found"
  const { q, page } = await searchParams;
  const pageNumber = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  const [stats, list, errors] = await Promise.all([
    getAdminStats(),
    listAdminUsers({ query: q, page: pageNumber, maskEmails: user.maskEmails }),
    listServerErrors(20),
  ]);

  return (
    <>
      <Topbar user={user} title="Admin" />
      <main className="dash-content">
        <PageHeader
          kicker="ADMIN"
          title="Users"
          text="Who has registered and logged in. You can see names, emails and counts, and block or delete users. You can’t see anyone’s projects, secrets or values."
        />
        <StatTiles stats={stats} />
        <div className="ad-stack">
          <LoginsChart days={stats.loginsByDay} />
          <UsersTable users={list.users} total={list.total} page={list.page} pages={list.pages} query={q?.trim() || undefined} maskEmails={user.maskEmails} />
          <ServerErrors errors={errors} />
        </div>
      </main>
    </>
  );
}

export default function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <DashboardFrame active="admin">
      <AdminContent searchParams={searchParams} />
    </DashboardFrame>
  );
}
