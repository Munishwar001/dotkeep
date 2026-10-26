"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api } from "./client-api";
import { ENVIRONMENTS, SECRET_TYPES } from "./constants";
import type { ProjectOption } from "./secret-dialog";

type BulkEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: string[];
  /** Projects the selected secrets can all move to (same owner, you can write there). Empty hides the field. */
  projects: ProjectOption[];
  /** Called after the change went through (even partly), so the table can clear the selection and hide values. */
  onDone: () => void;
};

export function BulkEditDialog({ open, onOpenChange, ...rest }: BulkEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <BulkEditForm {...rest} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

const KEEP = ""; // "leave as it is"

function BulkEditForm({ ids, projects, onDone, onClose }: Omit<BulkEditDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(KEEP);
  const [environment, setEnvironment] = useState(KEEP);
  const [type, setType] = useState(KEEP);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ id: string; name: string; error: string }[] | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!projectId && !environment && !type) return setError("Choose at least one thing to change.");

    setPending(true);
    setError(null);
    const result = await api<{ updated: number; failed: { id: string; name: string; error: string }[] }>("POST", "/api/vault/secrets/bulk", {
      action: "update",
      ids,
      ...(projectId ? { projectId } : {}),
      ...(environment ? { environment } : {}),
      ...(type ? { type } : {}),
    });
    setPending(false);
    if (!result.ok) return setError(result.error);
    onDone();
    router.refresh();
    if (result.data.failed.length) return setFailed(result.data.failed);
    onClose();
  }

  if (failed) {
    return (
      <div>
        <DialogHeader>
          <DialogTitle>Some secrets weren’t changed</DialogTitle>
          <DialogDescription>The rest were updated. These couldn’t take the change:</DialogDescription>
        </DialogHeader>
        <ul className="vt-import-issues">
          {failed.map((item) => <li key={item.id}><b>{item.name}</b>: {item.error}</li>)}
        </ul>
        <DialogFooter><Button type="button" onClick={onClose}>Done</Button></DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending}>
      <DialogHeader>
        <DialogTitle>Edit {ids.length} {ids.length === 1 ? "secret" : "secrets"}</DialogTitle>
        <DialogDescription>Change one or more things for all selected secrets. Anything left on “Keep as is” stays unchanged.</DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-5">
        {projects.length > 0 && (
          <Field>
            <FieldLabel htmlFor="bulk-project">Move to project</FieldLabel>
            <NativeSelect id="bulk-project" className="w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <NativeSelectOption value={KEEP}>Keep as is</NativeSelectOption>
              {projects.map((project) => <NativeSelectOption key={project.id} value={project.id}>{project.name}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
        )}
        <div className="vt-two">
          <Field>
            <FieldLabel htmlFor="bulk-environment">Environment</FieldLabel>
            <NativeSelect id="bulk-environment" className="w-full" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
              <NativeSelectOption value={KEEP}>Keep as is</NativeSelectOption>
              {ENVIRONMENTS.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="bulk-type">Type</FieldLabel>
            <NativeSelect id="bulk-type" className="w-full" value={type} onChange={(e) => setType(e.target.value)}>
              <NativeSelectOption value={KEEP}>Keep as is</NativeSelectOption>
              {SECRET_TYPES.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
        </div>
        {error && <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Apply to all"}</Button>
      </DialogFooter>
    </form>
  );
}
