"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "./client-api";
import { ENVIRONMENTS, LIMITS, type Environment } from "./constants";
import { canWriteTo, type ProjectOption } from "./secret-dialog";

export type TransferMode = "import" | "export";

type EnvTransferDialogProps = {
  mode: TransferMode | null; // null = closed
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  defaultProjectId?: string;
  defaultEnvironment?: Environment;
};

type ImportSummary = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: { name: string; error: string }[];
  lineErrors: { line: number; message: string }[];
};

export function EnvTransferDialog({ mode, onOpenChange, ...rest }: EnvTransferDialogProps) {
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Created fresh every time the dialog opens, so an old file or result never lingers. */}
        {mode && <TransferForm key={mode} mode={mode} {...rest} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function TransferForm({ mode, projects: allProjects, defaultProjectId, defaultEnvironment, onDone }: Omit<EnvTransferDialogProps, "onOpenChange"> & { mode: TransferMode; onDone: () => void }) {
  const router = useRouter();
  const importing = mode === "import";
  const projects = importing ? allProjects.filter(canWriteTo) : allProjects; // a viewer can export but not import
  const [projectId, setProjectId] = useState(projects.some((project) => project.id === defaultProjectId) ? defaultProjectId! : (projects[0]?.id ?? ""));
  const [environment, setEnvironment] = useState<Environment>(defaultEnvironment ?? "local");
  const [content, setContent] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [pending, setPending] = useState(false);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > LIMITS.importBytes) return setError(`The file is too big. The limit is ${Math.round(LIMITS.importBytes / 1000)} KB.`);
    setError(null);
    setContent(await file.text());
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!projectId) return setError("Choose a project.");
    if (importing && !content.trim()) return setError("Paste or choose a .env file first.");

    setPending(true);
    setError(null);
    setNotice(null);

    if (importing) {
      const result = await api<ImportSummary>("POST", "/api/vault/import", { projectId, environment, content, overwrite });
      setPending(false);
      if (!result.ok) return setError(result.error);
      setSummary(result.data);
      router.refresh();
      return;
    }

    const result = await api<{ content: string; count: number; skipped: string[]; projectName: string }>("POST", "/api/vault/export", { projectId, environment });
    setPending(false);
    if (!result.ok) return setError(result.error);
    if (result.data.count === 0) return setError("There are no secrets with valid variable names in that project and environment.");
    download(result.data.content, `.env.${environment}`);
    const skipped = result.data.skipped.length ? ` Left out because they aren’t valid variable names: ${result.data.skipped.join(", ")}.` : "";
    setNotice(`Downloaded ${result.data.count} ${result.data.count === 1 ? "variable" : "variables"}. The file holds real values, so keep it safe and don’t commit it.${skipped}`);
    router.refresh(); // the export is now in the activity log
  }

  if (summary) {
    const parts = [
      summary.created && `${summary.created} added`,
      summary.updated && `${summary.updated} updated`,
      summary.unchanged && `${summary.unchanged} unchanged`,
      summary.skipped && `${summary.skipped} skipped (already exist)`,
    ].filter(Boolean);
    return (
      <div>
        <DialogHeader>
          <DialogTitle>Import finished</DialogTitle>
          <DialogDescription>{parts.length ? parts.join(", ") + "." : "Nothing was imported."}</DialogDescription>
        </DialogHeader>
        {(summary.failed.length > 0 || summary.lineErrors.length > 0) && (
          <ul className="vt-import-issues">
            {summary.failed.map((item) => <li key={item.name}><b>{item.name}</b>: {item.error}</li>)}
            {summary.lineErrors.map((item) => <li key={item.line}>Line {item.line}: {item.message}</li>)}
          </ul>
        )}
        <DialogFooter><Button type="button" onClick={onDone}>Done</Button></DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending}>
      <DialogHeader>
        <DialogTitle>{importing ? "Import a .env file" : "Export to a .env file"}</DialogTitle>
        <DialogDescription>
          {importing
            ? "Every NAME=value line becomes an encrypted secret in the project and environment you choose."
            : "Downloads every secret of one project and environment as a .env file. Each one is written to the activity log."}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-5">
        <div className="vt-two">
          <Field>
            <FieldLabel htmlFor="transfer-project">Project</FieldLabel>
            <NativeSelect id="transfer-project" className="w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((project) => <NativeSelectOption key={project.id} value={project.id}>{project.name}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="transfer-environment">Environment</FieldLabel>
            <NativeSelect id="transfer-environment" className="w-full" value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
              {ENVIRONMENTS.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
        </div>

        {importing && (
          <>
            <Field>
              <div className="auth-label-row">
                <FieldLabel htmlFor="transfer-content">.env contents</FieldLabel>
                <label className="auth-link vt-file-button">
                  <FileUp aria-hidden="true" className="vt-inline-icon" /> Choose a file
                  <input type="file" accept=".env,.txt,text/plain,application/octet-stream" className="sr-only" onChange={onFile} />
                </label>
              </div>
              <Textarea
                id="transfer-content"
                rows={7}
                className="vt-value-input"
                placeholder={"DATABASE_URL=postgres://...\nAPI_KEY=abc123"}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <FieldDescription>Up to {LIMITS.importEntries} variables. Comments (#) and blank lines are ignored.</FieldDescription>
            </Field>
            <label className="vt-check">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              <span>Replace values that already exist <small>(the old value is kept in History)</small></span>
            </label>
          </>
        )}

        {error && <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}
        {notice && <p className="vt-notice" role="status">{notice}</p>}
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>{notice ? "Close" : "Cancel"}</Button>
        <Button type="submit" disabled={pending}>{pending ? (importing ? "Importing…" : "Exporting…") : importing ? "Import" : "Download .env"}</Button>
      </DialogFooter>
    </form>
  );
}

function download(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
