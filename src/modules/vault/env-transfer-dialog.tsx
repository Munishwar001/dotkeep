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
import { ENVIRONMENTS, LIMITS, TRANSFER_FORMATS, type Environment, type TransferFormat } from "./constants";
import { mergeVariables } from "@/modules/e2ee/export-merge";
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
  lineErrors: { line?: number; message: string }[];
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
  const [format, setFormat] = useState<TransferFormat>("env");
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
    if (importing && !content.trim()) return setError(`Paste or choose a ${formatLabel} file first.`);

    setPending(true);
    setError(null);
    setNotice(null);

    if (importing) {
      const result = await api<ImportSummary>("POST", "/api/vault/import", { projectId, environment, format, content, overwrite });
      setPending(false);
      if (!result.ok) return setError(result.error);
      setSummary(result.data);
      router.refresh();
      return;
    }

    const result = await api<{ content: string; count: number; skipped: string[]; projectName: string; encrypted?: { id: string; name: string; cipher: string }[] }>("POST", "/api/vault/export", { projectId, environment, format });
    if (!result.ok) {
      setPending(false);
      return setError(result.error);
    }
    if (result.data.count === 0) {
      setPending(false);
      return setError(format === "json" ? "There are no secrets in that project and environment." : "There are no secrets with valid variable names in that project and environment.");
    }
    let file: string;
    try {
      file = await mergeVariables(format, result.data.content, result.data.encrypted ?? []); // opens the end-to-end ones, here in the browser
    } catch (failure) {
      setPending(false);
      return setError(failure instanceof Error ? failure.message : "Couldn’t decrypt the end-to-end secrets.");
    }
    setPending(false);
    download(file, format === "json" ? `${result.data.projectName}.${environment}.json` : `.env.${environment}`, format === "json" ? "application/json" : "text/plain");
    const skipped = result.data.skipped.length ? ` Left out because they aren’t valid variable names: ${result.data.skipped.join(", ")}.` : "";
    setNotice(`Downloaded ${result.data.count} ${result.data.count === 1 ? "variable" : "variables"}. The file holds real values, so keep it safe and don’t commit it.${skipped}`);
    router.refresh(); // the export is now in the activity log
  }

  const formatLabel = TRANSFER_FORMATS.find((item) => item.value === format)!.label;

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
            {summary.failed.map((item, index) => <li key={index}><b>{item.name}</b>: {item.error}</li>)}
            {summary.lineErrors.map((item, index) => <li key={index}>{item.line ? `Line ${item.line}: ` : ""}{item.message}</li>)}
          </ul>
        )}
        <DialogFooter><Button type="button" onClick={onDone}>Done</Button></DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending}>
      <DialogHeader>
        <DialogTitle>{importing ? `Import a ${formatLabel} file` : `Export to a ${formatLabel} file`}</DialogTitle>
        <DialogDescription>
          {importing
            ? format === "json"
              ? "Every \"NAME\": \"value\" pair becomes an encrypted secret in the project and environment you choose."
              : "Every NAME=value line becomes an encrypted secret in the project and environment you choose."
            : `Downloads every secret of one project and environment as a ${formatLabel} file. Each one is written to the activity log.`}
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

        <Field>
          <FieldLabel htmlFor="transfer-format">Format</FieldLabel>
          <NativeSelect id="transfer-format" className="w-full" value={format} onChange={(e) => setFormat(e.target.value as TransferFormat)}>
            {TRANSFER_FORMATS.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
          </NativeSelect>
        </Field>

        {importing && (
          <>
            <Field>
              <div className="auth-label-row">
                <FieldLabel htmlFor="transfer-content">{formatLabel} contents</FieldLabel>
                <label className="auth-link vt-file-button">
                  <FileUp aria-hidden="true" className="vt-inline-icon" /> Choose a file
                  <input type="file" accept=".env,.json,.txt,text/plain,application/json,application/octet-stream" className="sr-only" onChange={onFile} />
                </label>
              </div>
              <Textarea
                id="transfer-content"
                rows={7}
                className="vt-value-input"
                placeholder={format === "json" ? '{\n  "DATABASE_URL": "postgres://...",\n  "API_KEY": "abc123"\n}' : "DATABASE_URL=postgres://...\nAPI_KEY=abc123"}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <FieldDescription>Up to {LIMITS.importEntries} variables. {format === "json" ? "A flat object of names and values. For a whole-vault backup use Restore backup." : "Comments (#) and blank lines are ignored."}</FieldDescription>
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
        <Button type="submit" disabled={pending}>{pending ? (importing ? "Importing…" : "Exporting…") : importing ? "Import" : `Download ${formatLabel}`}</Button>
      </DialogFooter>
    </form>
  );
}

export function download(content: string, filename: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
