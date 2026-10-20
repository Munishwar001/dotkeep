"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "./client-api";
import { ConfirmDialog } from "./confirm-dialog";
import { ProjectDialog } from "./project-dialog";

type ProjectActionsProps = {
  project: { id: string; name: string; description: string; secretCount: number };
  /** Where to go after deleting (used on the project's own page). Otherwise the page just refreshes. */
  redirectTo?: string;
};

/** The "..." menu for a project: edit or delete. */
export function ProjectActions({ project, redirectTo }: ProjectActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setPending(true);
    setError(null);
    const result = await api("DELETE", `/api/vault/projects/${project.id}`);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    setPending(false);
    setDeleting(false);
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  const secrets = project.secretCount === 1 ? "1 secret" : `${project.secretCount} secrets`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="vt-icon-button" aria-label={`Actions for ${project.name}`}>
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setEditing(true)}><Pencil aria-hidden="true" /> Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => { setError(null); setDeleting(true); }}><Trash2 aria-hidden="true" /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProjectDialog open={editing} onOpenChange={setEditing} project={project} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${project.name}”?`}
        description={`This permanently deletes the project and ${project.secretCount === 0 ? "everything in it" : `its ${secrets}`}. This can’t be undone.`}
        confirmLabel="Delete project"
        pending={pending}
        error={error}
        onConfirm={confirmDelete}
      />
    </>
  );
}
