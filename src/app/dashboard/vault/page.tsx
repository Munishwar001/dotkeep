import type { Metadata } from "next";
import { listProjects } from "@/db/projects";
import { listSecrets } from "@/db/secrets";
import { missingVaultConfig, requireUser } from "@/modules/dashboard/data";
import { DashboardFrame } from "@/modules/dashboard/frame";
import { Topbar } from "@/modules/dashboard/overview";
import { PageHeader, SetupNotice } from "@/modules/dashboard/page-header";
import { SecretsTable } from "@/modules/vault/secrets-table";

export const metadata: Metadata = {
  title: "Vault — Dotkeep",
  robots: { index: false },
};

async function VaultContent() {
  const { user, userId } = await requireUser();
  const missing = missingVaultConfig();

  if (missing.length) {
    return (
      <>
        <Topbar user={user} title="Vault" />
        <main className="dash-content"><SetupNotice missing={missing} /></main>
      </>
    );
  }

  const [secrets, projects] = await Promise.all([listSecrets(userId), listProjects(userId)]);

  return (
    <>
      <Topbar user={user} title="Vault" />
      <main className="dash-content">
        <PageHeader kicker="VAULT" title="Your secrets" text="Every secret across your projects. Values stay masked until you reveal them." />
        <SecretsTable secrets={secrets} projects={projects.map(({ id, name, role, ownerId }) => ({ id, name, role, ownerId }))} revealSeconds={user.revealSeconds} />
      </main>
    </>
  );
}

export default function VaultPage() {
  return (
    <DashboardFrame>
      <VaultContent />
    </DashboardFrame>
  );
}
