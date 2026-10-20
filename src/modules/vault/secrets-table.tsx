"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { PublicSecret } from "@/db/secrets";
import { api } from "./client-api";
import { ConfirmDialog } from "./confirm-dialog";
import { ENVIRONMENTS, REVEAL_SECONDS, SECRET_TYPES, environmentLabel, secretTypeLabel } from "./constants";
import { formatDate } from "./format";
import { SecretDialog, type ProjectOption } from "./secret-dialog";

type SecretsTableProps = {
  secrets: PublicSecret[];
  projects: ProjectOption[];
  /** On a project's own page: only that project's secrets, and no Project column or filter. */
  fixedProjectId?: string;
};

type DialogState = { kind: "new" } | { kind: "edit"; secret: PublicSecret } | null;

const MASK = "••••••••••••";

export function SecretsTable({ secrets, projects, fixedProjectId }: SecretsTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<PublicSecret | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Revealed values live only in this component's memory and hide themselves after REVEAL_SECONDS.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const hideTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    const timers = hideTimers.current;
    return () => Object.values(timers).forEach((timer) => window.clearTimeout(timer));
  }, []);

  const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? "Unknown project";
  const hasFilters = Boolean(query || projectFilter || environmentFilter || typeFilter);
  const visible = secrets.filter(
    (secret) =>
      (!query || secret.name.toLowerCase().includes(query.trim().toLowerCase())) &&
      (!projectFilter || secret.projectId === projectFilter) &&
      (!environmentFilter || secret.environment === environmentFilter) &&
      (!typeFilter || secret.type === typeFilter),
  );

  function hide(id: string) {
    window.clearTimeout(hideTimers.current[id]);
    delete hideTimers.current[id];
    setRevealed((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  /** Asks the server for the decrypted value. It is only ever fetched when you click. */
  async function fetchValue(id: string): Promise<string | null> {
    setBusyId(id);
    setRowError(null);
    const result = await api<{ value: string }>("POST", `/api/vault/secrets/${id}/reveal`);
    setBusyId(null);
    if (!result.ok) {
      setRowError(result.error);
      return null;
    }
    return result.data.value;
  }

  async function toggleReveal(id: string) {
    if (revealed[id] !== undefined) return hide(id);
    const value = await fetchValue(id);
    if (value === null) return;
    setRevealed((current) => ({ ...current, [id]: value }));
    hideTimers.current[id] = window.setTimeout(() => hide(id), REVEAL_SECONDS * 1000);
  }

  async function copy(id: string) {
    const value = revealed[id] ?? (await fetchValue(id));
    if (value === null) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    } catch {
      setRowError("Couldn’t copy to the clipboard. Reveal the value and copy it by hand.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError(null);
    const result = await api("DELETE", `/api/vault/secrets/${deleting.id}`);
    setDeletePending(false);
    if (!result.ok) return setDeleteError(result.error);
    hide(deleting.id);
    setDeleting(null);
    router.refresh();
  }

  const canAdd = projects.length > 0;

  return (
    <div className="vt-wrap">
      <div className="vt-toolbar">
        <label className="vt-search">
          <Search aria-hidden="true" />
          <Input className="h-10 pl-9" type="search" placeholder="Search secrets" aria-label="Search secrets" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {!fixedProjectId && (
          <NativeSelect className="vt-filter" aria-label="Filter by project" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <NativeSelectOption value="">All projects</NativeSelectOption>
            {projects.map((project) => <NativeSelectOption key={project.id} value={project.id}>{project.name}</NativeSelectOption>)}
          </NativeSelect>
        )}
        <NativeSelect className="vt-filter" aria-label="Filter by environment" value={environmentFilter} onChange={(e) => setEnvironmentFilter(e.target.value)}>
          <NativeSelectOption value="">All environments</NativeSelectOption>
          {ENVIRONMENTS.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect className="vt-filter" aria-label="Filter by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <NativeSelectOption value="">All types</NativeSelectOption>
          {SECRET_TYPES.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
        </NativeSelect>
        {canAdd ? (
          <Button size="lg" className="h-10 gap-2 px-4 text-[13px]" onClick={() => setDialog({ kind: "new" })}><Plus aria-hidden="true" /> New secret</Button>
        ) : (
          <Button size="lg" className="h-10 px-4 text-[13px]" nativeButton={false} render={<Link href="/dashboard/projects" />}>Create a project first</Button>
        )}
      </div>

      {rowError && <p className="vt-row-error" role="alert">{rowError}</p>}

      {secrets.length === 0 ? (
        <div className="vt-empty">
          <span className="vt-empty-icon"><KeyRound aria-hidden="true" /></span>
          <h3>{fixedProjectId ? "No secrets in this project yet" : "Your vault is empty"}</h3>
          <p>{canAdd ? "Add an API key, token, webhook, or database URL. Its value is encrypted before it is saved." : "Secrets live inside projects. Create a project first, then add your first secret."}</p>
          {canAdd ? (
            <Button className="mt-1" onClick={() => setDialog({ kind: "new" })}><Plus aria-hidden="true" /> Add your first secret</Button>
          ) : (
            <Button className="mt-1" nativeButton={false} render={<Link href="/dashboard/projects" />}>Go to Projects</Button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="vt-empty">
          <h3>No secrets match</h3>
          <p>Try a different search or clear the filters.</p>
          {hasFilters && <Button variant="outline" className="mt-1" onClick={() => { setQuery(""); setProjectFilter(""); setEnvironmentFilter(""); setTypeFilter(""); }}>Clear filters</Button>}
        </div>
      ) : (
        <div className={`vt${fixedProjectId ? " vt-noproject" : ""}`} role="table" aria-label="Secrets">
          <div className="vt-head" role="row">
            <span role="columnheader">Name</span>
            {!fixedProjectId && <span role="columnheader">Project</span>}
            <span role="columnheader">Environment</span>
            <span role="columnheader">Value</span>
            <span role="columnheader">Updated</span>
            <span role="columnheader"><span className="sr-only">Actions</span></span>
          </div>

          {visible.map((secret) => {
            const shown = revealed[secret.id];
            return (
              <div className="vt-row" role="row" key={secret.id}>
                <div role="cell" className="vt-name"><b>{secret.name}</b><small>{secretTypeLabel(secret.type)}</small></div>
                {!fixedProjectId && (
                  <div role="cell" className="vt-project" data-label="Project">
                    <Link href={`/dashboard/projects/${secret.projectId}`}>{projectName(secret.projectId)}</Link>
                  </div>
                )}
                <div role="cell" data-label="Environment"><span className="vt-env" data-env={secret.environment}>{environmentLabel(secret.environment)}</span></div>
                <div role="cell" className="vt-value" data-label="Value">
                  <code className={shown !== undefined ? "is-revealed" : undefined} aria-live="polite">{shown ?? MASK}</code>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={shown !== undefined ? `Hide ${secret.name}` : `Reveal ${secret.name}`} onClick={() => toggleReveal(secret.id)} disabled={busyId === secret.id}>
                    {shown !== undefined ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Copy ${secret.name}`} onClick={() => copy(secret.id)} disabled={busyId === secret.id}>
                    {copiedId === secret.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </Button>
                </div>
                <div role="cell" className="vt-date" data-label="Updated">{formatDate(secret.updatedAt)}</div>
                <div role="cell" className="vt-actions">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="vt-icon-button" aria-label={`Actions for ${secret.name}`}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setDialog({ kind: "edit", secret })}><Pencil aria-hidden="true" /> Edit</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => { setDeleteError(null); setDeleting(secret); }}><Trash2 aria-hidden="true" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="vt-note">Values are masked by default and hide again {REVEAL_SECONDS} seconds after you reveal them.</p>

      <SecretDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        projects={projects}
        defaultProjectId={fixedProjectId ?? (projectFilter || undefined)}
        secret={dialog?.kind === "edit" ? dialog.secret : undefined}
        onSaved={hide}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="This permanently deletes the secret and its stored value. This can’t be undone."
        confirmLabel="Delete secret"
        pending={deletePending}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
