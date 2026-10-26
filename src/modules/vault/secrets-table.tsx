"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Columns3, Copy, Download, Eye, EyeOff, History, KeyRound, List, ListChecks, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { PublicSecret } from "@/db/secrets";
import { BulkEditDialog } from "./bulk-edit-dialog";
import { api } from "./client-api";
import { ConfirmDialog } from "./confirm-dialog";
import { ENVIRONMENTS, REVEAL_SECONDS, SECRET_TYPES, environmentLabel, secretTypeLabel, type Environment } from "./constants";
import { EnvTransferDialog, type TransferMode } from "./env-transfer-dialog";
import { formatDate } from "./format";
import { HistoryDialog } from "./history-dialog";
import { canWriteTo, SecretDialog, type ProjectOption } from "./secret-dialog";
import { useReveal } from "./use-reveal";

type SecretsTableProps = {
  secrets: PublicSecret[];
  projects: ProjectOption[];
  /** On a project's own page: only that project's secrets, no Project column or filter, and the Environments view. */
  fixedProjectId?: string;
  /** How long a revealed value stays visible. It is the user's own setting (Settings -> Vault). */
  revealSeconds?: number;
};

type DialogState = { kind: "new"; prefill?: { name: string; environment: Environment } } | { kind: "edit"; secret: PublicSecret } | null;

const MASK = "••••••••••••";

export function SecretsTable({ secrets, projects, fixedProjectId, revealSeconds = REVEAL_SECONDS }: SecretsTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [view, setView] = useState<"list" | "environments">("list");

  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<PublicSecret | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [history, setHistory] = useState<PublicSecret | null>(null);
  const [transfer, setTransfer] = useState<TransferMode | null>(null);

  // Bulk actions: tick rows, then edit or delete them all at once.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const { revealed, copiedId, busyId, error: rowError, hide, toggleReveal, copy } = useReveal(revealSeconds);

  const projectOf = (id: string) => projects.find((project) => project.id === id);
  const projectName = (id: string) => projectOf(id)?.name ?? "Unknown project";
  /** Viewers can look at a secret but not change it. */
  const canChange = (secret: PublicSecret) => canWriteTo(projectOf(secret.projectId));
  const writableProjects = projects.filter(canWriteTo);
  const canAdd = fixedProjectId ? canWriteTo(projectOf(fixedProjectId)) : writableProjects.length > 0;

  const hasFilters = Boolean(query || projectFilter || environmentFilter || typeFilter);
  const visible = secrets.filter(
    (secret) =>
      (!query || secret.name.toLowerCase().includes(query.trim().toLowerCase())) &&
      (!projectFilter || secret.projectId === projectFilter) &&
      (!environmentFilter || secret.environment === environmentFilter) &&
      (!typeFilter || secret.type === typeFilter),
  );

  // Selection only counts rows that still exist and that you may change.
  const selectedSecrets = secrets.filter((secret) => selected.has(secret.id) && canChange(secret));
  const selectedIds = selectedSecrets.map((secret) => secret.id);
  const selectable = visible.filter(canChange);
  const allVisibleSelected = selectable.length > 0 && selectable.every((secret) => selected.has(secret.id));

  // Moving needs one common owner: a secret stays encrypted for its owner and can't change hands.
  const owners = new Set(selectedSecrets.map((secret) => projectOf(secret.projectId)?.ownerId));
  const movableProjects = owners.size === 1 ? writableProjects.filter((project) => project.ownerId === [...owners][0]) : [];

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const secret of selectable) {
        if (allVisibleSelected) next.delete(secret.id);
        else next.add(secret.id);
      }
      return next;
    });
  }

  function afterBulk() {
    selectedIds.forEach(hide);
    setSelected(new Set());
  }

  async function confirmBulkDelete() {
    setBulkPending(true);
    setBulkError(null);
    const result = await api("POST", "/api/vault/secrets/bulk", { action: "delete", ids: selectedIds });
    setBulkPending(false);
    if (!result.ok) return setBulkError(result.error);
    afterBulk();
    setBulkDeleting(false);
    router.refresh();
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

  /** The "..." menu of one secret, shared by the list and the environments view. */
  function secretMenu(secret: PublicSecret) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="vt-icon-button" aria-label={`Actions for ${secret.name}`}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {canChange(secret) && <DropdownMenuItem onClick={() => setDialog({ kind: "edit", secret })}><Pencil aria-hidden="true" /> Edit / move</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => setHistory(secret)}><History aria-hidden="true" /> History</DropdownMenuItem>
          {canChange(secret) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => { setDeleteError(null); setDeleting(secret); }}><Trash2 aria-hidden="true" /> Delete</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  /** Masked value with reveal and copy buttons. */
  function valueCells(secret: PublicSecret) {
    const shown = revealed[secret.id];
    return (
      <>
        <code className={shown !== undefined ? "is-revealed" : undefined} aria-live="polite">{shown ?? MASK}</code>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={shown !== undefined ? `Hide ${secret.name}` : `Reveal ${secret.name}`} onClick={() => toggleReveal(secret.id)} disabled={busyId === secret.id}>
          {shown !== undefined ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Copy ${secret.name}`} onClick={() => copy(secret.id)} disabled={busyId === secret.id}>
          {copiedId === secret.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </Button>
      </>
    );
  }

  // Environments view: one row per secret name, one column per environment.
  const rows = [...visible.reduce((map, secret) => {
    const key = secret.name.trim().toLowerCase();
    const row = map.get(key) ?? { name: secret.name, byEnv: {} as Partial<Record<Environment, PublicSecret>> };
    row.byEnv[secret.environment] = secret;
    return map.set(key, row);
  }, new Map<string, { name: string; byEnv: Partial<Record<Environment, PublicSecret>> }>()).values()].sort((a, b) => a.name.localeCompare(b.name));

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
        {view === "list" && (
          <NativeSelect className="vt-filter" aria-label="Filter by environment" value={environmentFilter} onChange={(e) => setEnvironmentFilter(e.target.value)}>
            <NativeSelectOption value="">All environments</NativeSelectOption>
            {ENVIRONMENTS.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
          </NativeSelect>
        )}
        <NativeSelect className="vt-filter" aria-label="Filter by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <NativeSelectOption value="">All types</NativeSelectOption>
          {SECRET_TYPES.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
        </NativeSelect>
        {fixedProjectId && (
          <div className="vt-viewtoggle" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}><List aria-hidden="true" /> List</button>
            <button type="button" aria-pressed={view === "environments"} onClick={() => { setView("environments"); setEnvironmentFilter(""); }}><Columns3 aria-hidden="true" /> Environments</button>
          </div>
        )}
        {projects.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="vt-more-button" aria-label=".env import and export"><Upload aria-hidden="true" /> .env</DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {canAdd && <DropdownMenuItem onClick={() => setTransfer("import")}><Upload aria-hidden="true" /> Import .env file</DropdownMenuItem>}
              <DropdownMenuItem onClick={() => setTransfer("export")}><Download aria-hidden="true" /> Export to .env</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {canAdd ? (
          <Button size="lg" className="h-10 gap-2 px-4 text-[13px]" onClick={() => setDialog({ kind: "new" })}><Plus aria-hidden="true" /> New secret</Button>
        ) : fixedProjectId ? null : (
          <Button size="lg" className="h-10 px-4 text-[13px]" nativeButton={false} render={<Link href="/dashboard/projects" />}>Create a project first</Button>
        )}
      </div>

      {rowError && <p className="vt-row-error" role="alert">{rowError}</p>}

      {selectedIds.length > 0 && (
        <div className="vt-bulkbar" role="region" aria-label="Bulk actions">
          <span><ListChecks aria-hidden="true" /> {selectedIds.length} selected</span>
          <div>
            <Button type="button" size="sm" variant="outline" onClick={() => setBulkEditing(true)}><Pencil aria-hidden="true" /> Edit / move</Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => { setBulkError(null); setBulkDeleting(true); }}><Trash2 aria-hidden="true" /> Delete</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X aria-hidden="true" /> Clear</Button>
          </div>
        </div>
      )}

      {secrets.length === 0 ? (
        <div className="vt-empty">
          <span className="vt-empty-icon"><KeyRound aria-hidden="true" /></span>
          <h3>{fixedProjectId ? "No secrets in this project yet" : "Your vault is empty"}</h3>
          <p>
            {canAdd
              ? "Add an API key, token, webhook, or database URL. Its value is encrypted before it is saved."
              : fixedProjectId
                ? "You have view-only access to this project. An editor or the owner can add secrets."
                : "Secrets live inside projects. Create a project first, then add your first secret."}
          </p>
          {canAdd ? (
            <Button className="mt-1" onClick={() => setDialog({ kind: "new" })}><Plus aria-hidden="true" /> Add your first secret</Button>
          ) : fixedProjectId ? null : (
            <Button className="mt-1" nativeButton={false} render={<Link href="/dashboard/projects" />}>Go to Projects</Button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="vt-empty">
          <h3>No secrets match</h3>
          <p>Try a different search or clear the filters.</p>
          {hasFilters && <Button variant="outline" className="mt-1" onClick={() => { setQuery(""); setProjectFilter(""); setEnvironmentFilter(""); setTypeFilter(""); }}>Clear filters</Button>}
        </div>
      ) : view === "environments" ? (
        <div className="ev" role="table" aria-label="Secrets by environment">
          <div className="ev-head" role="row">
            <span role="columnheader">Name</span>
            {ENVIRONMENTS.map((env) => <span role="columnheader" key={env.value}>{env.label}</span>)}
          </div>
          {rows.map((row) => {
            const missing = ENVIRONMENTS.filter((env) => !row.byEnv[env.value]);
            return (
              <div className="ev-row" role="row" key={row.name.toLowerCase()} data-gap={missing.length > 0 || undefined}>
                <div role="cell" className="vt-name">
                  <b>{row.name}</b>
                  <small>{missing.length ? `Missing in ${missing.map((env) => env.label).join(", ")}` : "In every environment"}</small>
                </div>
                {ENVIRONMENTS.map((env) => {
                  const secret = row.byEnv[env.value];
                  return (
                    <div role="cell" className="ev-cell" data-label={env.label} key={env.value}>
                      {secret ? (
                        <>
                          <div className="vt-value">{valueCells(secret)}</div>
                          {secretMenu(secret)}
                        </>
                      ) : canAdd ? (
                        <Button type="button" variant="outline" size="xs" onClick={() => setDialog({ kind: "new", prefill: { name: row.name, environment: env.value } })}>
                          <Plus aria-hidden="true" /> Add
                        </Button>
                      ) : (
                        <span className="ev-none">Not set</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`vt${fixedProjectId ? " vt-noproject" : ""}`} role="table" aria-label="Secrets">
          <div className="vt-head" role="row">
            <span role="columnheader">
              {selectable.length > 0 && <input type="checkbox" className="vt-checkbox" aria-label="Select all shown secrets" checked={allVisibleSelected} onChange={toggleAllVisible} />}
            </span>
            <span role="columnheader">Name</span>
            {!fixedProjectId && <span role="columnheader">Project</span>}
            <span role="columnheader">Environment</span>
            <span role="columnheader">Value</span>
            <span role="columnheader">Updated</span>
            <span role="columnheader"><span className="sr-only">Actions</span></span>
          </div>

          {visible.map((secret) => (
            <div className="vt-row" role="row" key={secret.id} data-selected={selected.has(secret.id) || undefined}>
              <div role="cell" className="vt-select">
                {canChange(secret) && (
                  <input type="checkbox" className="vt-checkbox" aria-label={`Select ${secret.name}`} checked={selected.has(secret.id)} onChange={() => toggleSelected(secret.id)} />
                )}
              </div>
              <div role="cell" className="vt-name"><b>{secret.name}</b><small>{secretTypeLabel(secret.type)}</small></div>
              {!fixedProjectId && (
                <div role="cell" className="vt-project" data-label="Project">
                  <Link href={`/dashboard/projects/${secret.projectId}`}>{projectName(secret.projectId)}</Link>
                </div>
              )}
              <div role="cell" data-label="Environment"><span className="vt-env" data-env={secret.environment}>{environmentLabel(secret.environment)}</span></div>
              <div role="cell" className="vt-value" data-label="Value">{valueCells(secret)}</div>
              <div role="cell" className="vt-date" data-label="Updated">{formatDate(secret.updatedAt)}</div>
              <div role="cell" className="vt-actions">{secretMenu(secret)}</div>
            </div>
          ))}
        </div>
      )}

      <p className="vt-note">Values are masked by default and hide again {revealSeconds} seconds after you reveal them.</p>

      <SecretDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        projects={projects}
        defaultProjectId={fixedProjectId ?? (projectFilter || undefined)}
        secret={dialog?.kind === "edit" ? dialog.secret : undefined}
        prefill={dialog?.kind === "new" ? dialog.prefill : undefined}
        onSaved={hide}
      />

      <HistoryDialog secret={history} onOpenChange={(open) => !open && setHistory(null)} revealSeconds={revealSeconds} canRestore={history ? canChange(history) : false} onRestored={hide} />

      <EnvTransferDialog
        mode={transfer}
        onOpenChange={(open) => !open && setTransfer(null)}
        projects={projects}
        defaultProjectId={fixedProjectId ?? (projectFilter || undefined)}
        defaultEnvironment={(environmentFilter || undefined) as Environment | undefined}
      />

      <BulkEditDialog open={bulkEditing} onOpenChange={setBulkEditing} ids={selectedIds} projects={movableProjects} onDone={afterBulk} />

      <ConfirmDialog
        open={bulkDeleting}
        onOpenChange={setBulkDeleting}
        title={`Delete ${selectedIds.length} ${selectedIds.length === 1 ? "secret" : "secrets"}?`}
        description="This permanently deletes the selected secrets, their stored values and their history. This can’t be undone."
        confirmLabel="Delete secrets"
        pending={bulkPending}
        error={bulkError}
        onConfirm={confirmBulkDelete}
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
