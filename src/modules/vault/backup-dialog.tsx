"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { api } from "./client-api";
import { LIMITS } from "./constants";
import { mergeBackup, type EncryptedBackupSecret } from "@/modules/e2ee/export-merge";
import { download } from "./env-transfer-dialog";

export type BackupMode = "export" | "restore";

type BackupDialogProps = {
  mode: BackupMode | null; // null = closed
  onOpenChange: (open: boolean) => void;
};

type RestoreSummary = {
  projectsCreated: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: { name: string; error: string }[];
  issues: string[];
};

export function BackupDialog({ mode, onOpenChange }: BackupDialogProps) {
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Created fresh every time the dialog opens, so an old file or result never lingers. */}
        {mode && <BackupForm key={mode} mode={mode} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function BackupForm({ mode, onDone }: { mode: BackupMode; onDone: () => void }) {
  const router = useRouter();
  const restoring = mode === "restore";
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const [pending, setPending] = useState(false);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > LIMITS.backupBytes) return setError(`The file is too big. The limit is ${Math.round(LIMITS.backupBytes / 1_000_000)} MB.`);
    setError(null);
    setFileName(file.name);
    setContent(await file.text());
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (restoring && !content.trim()) return setError("Choose a backup file first.");

    setPending(true);
    setError(null);
    setNotice(null);

    if (restoring) {
      const result = await api<RestoreSummary>("POST", "/api/vault/backup/import", { content, overwrite });
      setPending(false);
      if (!result.ok) return setError(result.error);
      setSummary(result.data);
      router.refresh();
      return;
    }

    const result = await api<{ content: string; projects: number; secrets: number; encrypted?: EncryptedBackupSecret[] }>("POST", "/api/vault/backup/export");
    if (!result.ok) {
      setPending(false);
      return setError(result.error);
    }
    if (result.data.secrets === 0) {
      setPending(false);
      return setError("Your vault has no secrets to back up yet.");
    }
    let file: string;
    try {
      file = await mergeBackup(result.data.content, result.data.encrypted ?? []); // opens the end-to-end ones, here in the browser
    } catch (failure) {
      setPending(false);
      return setError(failure instanceof Error ? failure.message : "Couldn’t decrypt the end-to-end secrets.");
    }
    setPending(false);
    download(file, `dotkeep-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    setNotice(
      `Downloaded ${result.data.secrets} ${result.data.secrets === 1 ? "secret" : "secrets"} from ${result.data.projects} ${result.data.projects === 1 ? "project" : "projects"}. The file holds real values and isn’t encrypted, so keep it safe and don’t commit it.`,
    );
    router.refresh(); // every exported secret is now in the activity log
  }

  if (summary) {
    const parts = [
      summary.projectsCreated && `${summary.projectsCreated} ${summary.projectsCreated === 1 ? "project" : "projects"} created`,
      summary.created && `${summary.created} added`,
      summary.updated && `${summary.updated} updated`,
      summary.unchanged && `${summary.unchanged} unchanged`,
      summary.skipped && `${summary.skipped} skipped (already exist)`,
    ].filter(Boolean);
    return (
      <div>
        <DialogHeader>
          <DialogTitle>Restore finished</DialogTitle>
          <DialogDescription>{parts.length ? parts.join(", ") + "." : "Nothing was restored."}</DialogDescription>
        </DialogHeader>
        {(summary.failed.length > 0 || summary.issues.length > 0) && (
          <ul className="vt-import-issues">
            {summary.failed.map((item, index) => <li key={index}><b>{item.name}</b>: {item.error}</li>)}
            {summary.issues.map((item, index) => <li key={`issue-${index}`}>{item}</li>)}
          </ul>
        )}
        <DialogFooter><Button type="button" onClick={onDone}>Done</Button></DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending}>
      <DialogHeader>
        <DialogTitle>{restoring ? "Restore a backup" : "Back up your vault"}</DialogTitle>
        <DialogDescription>
          {restoring
            ? "Reads a Dotkeep backup file. Projects are matched by name and created when missing. Secrets go back into the same project and environment."
            : "Downloads every project you own, with all of its secrets and notes, as one JSON file. Each secret is written to the activity log. Projects shared with you aren’t included."}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-5">
        {restoring && (
          <>
            <Field>
              <FieldLabel htmlFor="backup-file">Backup file</FieldLabel>
              <label className="auth-link vt-file-button">
                <FileUp aria-hidden="true" className="vt-inline-icon" /> {fileName || "Choose a .json file"}
                <input id="backup-file" type="file" accept=".json,application/json" className="sr-only" onChange={onFile} />
              </label>
              <FieldDescription>Up to {LIMITS.secrets.toLocaleString("en")} secrets. Only files made by Dotkeep’s backup are accepted.</FieldDescription>
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
        <Button type="submit" disabled={pending}>{pending ? (restoring ? "Restoring…" : "Exporting…") : restoring ? "Restore" : "Download backup"}</Button>
      </DialogFooter>
    </form>
  );
}
