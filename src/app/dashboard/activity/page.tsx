import type { Metadata } from "next";
import { listProjects } from "@/db/projects";
import { listEvents } from "@/db/secret-events";
import { missingVaultConfig, requireUser } from "@/modules/dashboard/data";
import { DashboardFrame } from "@/modules/dashboard/frame";
import { Topbar } from "@/modules/dashboard/overview";
import { PageHeader, SetupNotice } from "@/modules/dashboard/page-header";
import { ActivityList } from "@/modules/vault/activity-list";

export const metadata: Metadata = {
  title: "Activity — Dotkeep",
  robots: { index: false },
};

async function ActivityContent() {
  const { user, userId } = await requireUser();
  const missing = missingVaultConfig();

  if (missing.length) {
    return (
      <>
        <Topbar user={user} title="Activity" />
        <main className="dash-content"><SetupNotice missing={missing} /></main>
      </>
    );
  }

  const [events, projects] = await Promise.all([listEvents(userId, { limit: 200 }), listProjects(userId)]);
  const projectNames = Object.fromEntries(projects.map((project) => [project.id, project.name]));

  return (
    <>
      <Topbar user={user} title="Activity" />
      <main className="dash-content">
        <PageHeader kicker="ACTIVITY" title="Audit log" text="Who looked at, changed, moved, imported or exported your secrets, and when. Values are never stored here. Showing the latest 200 events." />
        <ActivityList events={events} projectNames={projectNames} />
      </main>
    </>
  );
}

export default function ActivityPage() {
  return (
    <DashboardFrame active="activity">
      <ActivityContent />
    </DashboardFrame>
  );
}
