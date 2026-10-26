import type { Metadata } from "next";
import { countProjects } from "@/db/projects";
import { countSecrets, usedEnvironments } from "@/db/secrets";
import { missingVaultConfig, requireUser } from "@/modules/dashboard/data";
import { DashboardFrame } from "@/modules/dashboard/frame";
import { Overview, Topbar } from "@/modules/dashboard/overview";

export const metadata: Metadata = {
  title: "Dashboard — Dotkeep",
  robots: { index: false },
};

async function OverviewContent() {
  const { user, userId } = await requireUser();

  // Without the encryption key the vault is off, so show zeros instead of failing.
  const counts = missingVaultConfig().length
    ? { secrets: 0, projects: 0, environments: 0 }
    : await Promise.all([countSecrets(userId), countProjects(userId), usedEnvironments(userId)]).then(
        ([secrets, projects, environments]) => ({ secrets, projects, environments: environments.length }),
      );

  return (
    <>
      <Topbar user={user} title="Overview" />
      <Overview user={user} counts={counts} />
    </>
  );
}

export default function DashboardPage() {
  return (
    <DashboardFrame>
      <OverviewContent />
    </DashboardFrame>
  );
}
