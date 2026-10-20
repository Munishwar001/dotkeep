import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { parseObjectId } from "@/db/collections";
import { getProject, listProjects } from "@/db/projects";
import { listSecrets } from "@/db/secrets";
import { missingVaultConfig, requireUser } from "@/modules/dashboard/data";
import { DashboardFrame } from "@/modules/dashboard/frame";
import { Topbar } from "@/modules/dashboard/overview";
import { PageHeader, SetupNotice } from "@/modules/dashboard/page-header";
import { ProjectActions } from "@/modules/vault/project-actions";
import { SecretsTable } from "@/modules/vault/secrets-table";

export const metadata: Metadata = {
  title: "Project — Dotkeep",
  robots: { index: false },
};

// `params` is request-time data, so it is read inside the Suspense boundary from DashboardFrame.
async function ProjectContent({ params }: { params: Promise<{ id: string }> }) {
  const projectId = parseObjectId((await params).id);
  if (!projectId) notFound();

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

  const [project, secrets, projects] = await Promise.all([getProject(userId, projectId), listSecrets(userId, { projectId }), listProjects(userId)]);
  if (!project) notFound(); // also what you see for another user's project: it simply doesn't exist for you

  return (
    <>
      <Topbar user={user} title={`Projects / ${project.name}`} />
      <main className="dash-content">
        <Link className="dash-back" href="/dashboard/projects"><ArrowLeft aria-hidden="true" /> All projects</Link>
        <PageHeader
          kicker="PROJECT"
          title={project.name}
          text={project.description || undefined}
          actions={<ProjectActions project={project} redirectTo="/dashboard/projects" />}
        />
        <SecretsTable secrets={secrets} projects={projects.map(({ id, name }) => ({ id, name }))} fixedProjectId={project.id} />
      </main>
    </>
  );
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <DashboardFrame active="projects">
      <ProjectContent params={params} />
    </DashboardFrame>
  );
}
