import Link from "next/link";
import { FolderKanban } from "lucide-react";
import type { PublicProject } from "@/db/projects";
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
      <p className="dash-project-text">{project.description || "No description"}</p>
      <p className="dash-project-meta">
        {project.secretCount === 1 ? "1 secret" : `${project.secretCount} secrets`} · Updated {formatDate(project.updatedAt)}
      </p>
      <div className="dash-project-actions"><ProjectActions project={project} /></div>
    </article>
  );
}
