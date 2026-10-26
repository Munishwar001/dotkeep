import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { listProjects } from "@/db/projects";
import { missingVaultConfig, requireUser } from "@/modules/dashboard/data";
import { DashboardFrame } from "@/modules/dashboard/frame";
import { Topbar } from "@/modules/dashboard/overview";
import { PageHeader, SetupNotice } from "@/modules/dashboard/page-header";
import { NewProjectButton } from "@/modules/vault/project-dialog";
import { ProjectCard } from "@/modules/vault/project-card";

export const metadata: Metadata = {
  title: "Projects — Dotkeep",
  robots: { index: false },
};

async function ProjectsContent() {
  const { user, userId } = await requireUser();
  const missing = missingVaultConfig();

  if (missing.length) {
    return (
      <>
        <Topbar user={user} title="Projects" />
        <main className="dash-content"><SetupNotice missing={missing} /></main>
      </>
    );
  }

  const projects = await listProjects(userId);

  return (
    <>
      <Topbar user={user} title="Projects" />
      <main className="dash-content">
        <PageHeader
          kicker="PROJECTS"
          title="Your projects"
          text="A project groups the secrets for one app or service. Share one with your team from its page."
          actions={projects.length > 0 ? <NewProjectButton /> : undefined}
        />

        {projects.length === 0 ? (
          <div className="vt-empty">
            <span className="vt-empty-icon"><FolderKanban aria-hidden="true" /></span>
            <h3>No projects yet</h3>
            <p>Create your first project, then add secrets to it.</p>
            <NewProjectButton label="Create your first project" />
          </div>
        ) : (
          <div className="dash-projects">
            {projects.map((project, index) => <ProjectCard key={project.id} project={project} index={index} />)}
          </div>
        )}
      </main>
    </>
  );
}

export default function ProjectsPage() {
  return (
    <DashboardFrame>
      <ProjectsContent />
    </DashboardFrame>
  );
}
