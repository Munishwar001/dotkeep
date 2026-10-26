import Link from "next/link";
import { FolderKanban, Users } from "lucide-react";
import type { PublicProject } from "@/db/projects";
import { ROLE_LABELS } from "./constants";
import { formatDate } from "./format";
import { ProjectActions } from "./project-actions";


const reveal = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function ProjectCard({ project, index }: { project: PublicProject; index: number }) {
  return (
    <article className="dash-project dash-reveal" style={reveal(index)}>
      <span className="dash-tile-icon"><FolderKanban aria-hidden="true" /></span>
      <h3>
        {/* The link's ::after covers the whole card, so the card is clickable while the menu stays usable. */}
        <Link href={`/dashboard/projects/${project.id}`}>{project.name}</Link>
      </h3>
      {project.role !== "owner" ? (
        <p className="vt-share-badge"><Users aria-hidden="true" /> Shared by {project.ownerName} · {ROLE_LABELS[project.role]}</p>
      ) : project.memberCount > 0 ? (
        <p className="vt-share-badge"><Users aria-hidden="true" /> Shared with {project.memberCount === 1 ? "1 person" : `${project.memberCount} people`}</p>
      ) : null}
      <p className="dash-project-text">{project.description || "No description"}</p>
      <p className="dash-project-meta">
        {project.secretCount === 1 ? "1 secret" : `${project.secretCount} secrets`} · Updated {formatDate(project.updatedAt)}
      </p>
      {project.role === "owner" && <div className="dash-project-actions"><ProjectActions project={project} /></div>}
    </article>
  );
}
