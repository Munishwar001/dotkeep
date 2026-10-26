"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { Role } from "@/db/access";
import type { PublicSecret } from "@/db/secrets";
import { api } from "./client-api";
import { ENVIRONMENTS, LIMITS, SECRET_TYPES, type Environment, type SecretType } from "./constants";

/** A project the user can open. `role` decides what they may do there; `ownerId` limits where a secret can move. */
export type ProjectOption = { id: string; name: string; role: Role; ownerId: string };

export const canWriteTo = (project: ProjectOption | undefined) => project !== undefined && project.role !== "viewer";

type SecretDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  defaultProjectId?: string;
  secret?: PublicSecret; // present = edit, absent = create
  /** Create only: start with this name and environment (used to fill a gap in the environments view). */
  prefill?: { name: string; environment: Environment };
  /** Called after an edit is saved, so the table can hide a value that is now out of date. */
  onSaved?: (secretId: string) => void;
};

export function SecretDialog({ open, onOpenChange, ...rest }: SecretDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Created fresh every time the dialog opens, so old input never lingers. */}
        <SecretForm {...rest} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SecretForm({ projects: allProjects, defaultProjectId, secret, prefill, onSaved, onDone }: Omit<SecretDialogProps, "open" | "onOpenChange"> & { onDone: () => void }) {
  const router = useRouter();
  const editing = Boolean(secret);
  // You can only put secrets where you may write, and a secret only moves between projects of the same owner.
  const ownerId = secret ? allProjects.find((project) => project.id === secret.projectId)?.ownerId : undefined;
  const projects = allProjects.filter((project) => canWriteTo(project) && (!ownerId || project.ownerId === ownerId));
  const [name, setName] = useState(secret?.name ?? prefill?.name ?? "");
  const [projectId, setProjectId] = useState(
    secret?.projectId ?? (projects.some((project) => project.id === defaultProjectId) ? defaultProjectId : undefined) ?? projects[0]?.id ?? "",
  );
  const [environment, setEnvironment] = useState<Environment>(secret?.environment ?? prefill?.environment ?? "local");
  const [type, setType] = useState<SecretType>(secret?.type ?? "api_key");
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) return setError("Enter a name for this secret.");
    if (!editing && !projectId) return setError("Choose a project.");
    if (!editing && !value.trim()) return setError("Enter the secret value.");

    setPending(true);
    setError(null);
    const result = secret
      ? await api("PATCH", `/api/vault/secrets/${secret.id}`, {
          name,
          environment,
          type,
          ...(projectId !== secret.projectId ? { projectId } : {}), // a different project = move the secret there
          ...(value ? { value } : {}), // blank = keep the stored value
        })
      : await api("POST", "/api/vault/secrets", { projectId, name, environment, type, value });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    if (secret) onSaved?.(secret.id);
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending}>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit secret" : "New secret"}</DialogTitle>
        <DialogDescription>
          {editing ? "Change the details, or pick another project to move it. Leave the value blank to keep the current one. A new value keeps the old one in History." : "The value is encrypted before it is saved."}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-5">
        <Field>
          <FieldLabel htmlFor="secret-name">Name</FieldLabel>
          <Input id="secret-name" className="h-10" placeholder="e.g. DATABASE_URL" maxLength={LIMITS.secretName} autoFocus autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field>
          <FieldLabel htmlFor="secret-project">Project</FieldLabel>
          <NativeSelect id="secret-project" className="w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((project) => <NativeSelectOption key={project.id} value={project.id}>{project.name}</NativeSelectOption>)}
          </NativeSelect>
        </Field>

        <div className="vt-two">
          <Field>
            <FieldLabel htmlFor="secret-environment">Environment</FieldLabel>
            <NativeSelect id="secret-environment" className="w-full" value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
              {ENVIRONMENTS.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="secret-type">Type</FieldLabel>
            <NativeSelect id="secret-type" className="w-full" value={type} onChange={(e) => setType(e.target.value as SecretType)}>
              {SECRET_TYPES.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
        </div>

        <Field>
          <div className="auth-label-row">
            <FieldLabel htmlFor="secret-value">Value</FieldLabel>
            <button type="button" className="auth-link" onClick={() => setShowValue((s) => !s)} aria-pressed={showValue}>
              {showValue ? <><EyeOff aria-hidden="true" className="vt-inline-icon" /> Hide</> : <><Eye aria-hidden="true" className="vt-inline-icon" /> Show</>}
            </button>
          </div>
          <Textarea
            id="secret-value"
            rows={3}
            className={`vt-value-input${showValue ? "" : " is-masked"}`}
            placeholder={editing ? "Leave blank to keep the current value" : "Paste the secret value"}
            maxLength={LIMITS.secretValue}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {editing && <FieldDescription>The current value is never shown here. Reveal it from the list instead.</FieldDescription>}
        </Field>

        {error && <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Save secret"}</Button>
      </DialogFooter>
    </form>
  );
}
