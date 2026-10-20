"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "./client-api";
import { LIMITS } from "./constants";

type EditableProject = { id: string; name: string; description: string };

type ProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: EditableProject; // present = edit, absent = create
};

export function ProjectDialog({ open, onOpenChange, project }: ProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* The form lives inside DialogContent, so it is created fresh every time the dialog opens. */}
        <ProjectForm project={project} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({ project, onDone }: { project?: EditableProject; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) return setError("Enter a project name.");

    setPending(true);
    setError(null);
    const result = project
      ? await api("PATCH", `/api/vault/projects/${project.id}`, { name, description })
      : await api("POST", "/api/vault/projects", { name, description });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending}>
      <DialogHeader>
        <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
        <DialogDescription>{project ? "Change the name or description." : "A project groups the secrets for one app or service."}</DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-5">
        <Field>
          <FieldLabel htmlFor="project-name">Name</FieldLabel>
          <Input id="project-name" className="h-10" placeholder="e.g. Launchpad" maxLength={LIMITS.projectName} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="project-description">Description <span className="vt-optional">(optional)</span></FieldLabel>
          <Textarea id="project-description" rows={3} maxLength={LIMITS.projectDescription} placeholder="What is this project for?" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : project ? "Save changes" : "Create project"}</Button>
      </DialogFooter>
    </form>
  );
}

export function NewProjectButton({ label = "New project" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" className="h-10 gap-2 px-4 text-[13px]" onClick={() => setOpen(true)}><Plus aria-hidden="true" /> {label}</Button>
      <ProjectDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
