"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Copy, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PublicEvent } from "@/db/secret-events";
import type { PublicSecret } from "@/db/secrets";
import type { PublicVersion } from "@/db/secret-history";
import { ActivityList } from "./activity-list";
import { api, apiGet } from "./client-api";
import { formatDateTime } from "./format";

type HistoryDialogProps = {
  secret: PublicSecret | null;
  onOpenChange: (open: boolean) => void;
  revealSeconds: number;
  /** Viewers can read the history but not restore from it. */
  canRestore: boolean;
  /** Called after a restore, so the table can hide a value that is now out of date. */
  onRestored: (secretId: string) => void;
};

export function HistoryDialog({ secret, onOpenChange, ...rest }: HistoryDialogProps) {
  return (
    <Dialog open={secret !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Keyed by secret, so it loads fresh every time and never shows another secret's history. */}
        {secret && <HistoryBody key={secret.id} secret={secret} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}

function HistoryBody({ secret, revealSeconds, canRestore, onRestored }: { secret: PublicSecret; revealSeconds: number; canRestore: boolean; onRestored: (secretId: string) => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<"versions" | "activity">("versions");
  const [versions, setVersions] = useState<PublicVersion[] | null>(null);
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timers = useRef<Record<string, number>>({});

  async function load() {
    const [v, a] = await Promise.all([
      apiGet<{ versions: PublicVersion[] }>(`/api/vault/secrets/${secret.id}/versions`),
      apiGet<{ events: PublicEvent[] }>(`/api/vault/secrets/${secret.id}/activity`),
    ]);
    if (!v.ok) return setError(v.error);
    if (!a.ok) return setError(a.error);
    setVersions(v.data.versions);
    setEvents(a.data.events);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<{ versions: PublicVersion[] }>(`/api/vault/secrets/${secret.id}/versions`),
      apiGet<{ events: PublicEvent[] }>(`/api/vault/secrets/${secret.id}/activity`),
    ]).then(([v, a]) => {
      if (cancelled) return;
      if (!v.ok) return setError(v.error);
      if (!a.ok) return setError(a.error);
      setVersions(v.data.versions);
      setEvents(a.data.events);
    });
    const pending = timers.current;
    return () => {
      cancelled = true;
      Object.values(pending).forEach((timer) => window.clearTimeout(timer));
    };
  }, [secret.id]);

  function hide(id: string) {
    window.clearTimeout(timers.current[id]);
    delete timers.current[id];
    setRevealed((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function fetchValue(versionId: string): Promise<string | null> {
    setBusyId(versionId);
    setError(null);
    const result = await api<{ value: string }>("POST", `/api/vault/secrets/${secret.id}/versions/${versionId}/reveal`);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    return result.data.value;
  }

  async function toggleReveal(versionId: string) {
    if (revealed[versionId] !== undefined) return hide(versionId);
    const value = await fetchValue(versionId);
    if (value === null) return;
    setRevealed((current) => ({ ...current, [versionId]: value }));
    timers.current[versionId] = window.setTimeout(() => hide(versionId), revealSeconds * 1000);
    load(); // the "Viewed" line is now in the activity list
  }

  async function copy(versionId: string) {
    const value = revealed[versionId] ?? (await fetchValue(versionId));
    if (value === null) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(versionId);
      window.setTimeout(() => setCopiedId((current) => (current === versionId ? null : current)), 1500);
    } catch {
      setError("Couldn’t copy to the clipboard. Reveal the value and copy it by hand.");
    }
  }

  async function restore(versionId: string) {
    setBusyId(versionId);
    setError(null);
    const result = await api("POST", `/api/vault/secrets/${secret.id}/versions/${versionId}/restore`);
    setBusyId(null);
    if (!result.ok) return setError(result.error);
    Object.keys(revealed).forEach(hide);
    onRestored(secret.id);
    router.refresh();
    load();
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>History of “{secret.name}”</DialogTitle>
        <DialogDescription>Earlier values of this secret and everything that happened to it. Old values are encrypted like the current one.</DialogDescription>
      </DialogHeader>

      <div className="vt-tabs" role="tablist" aria-label="History">
        <button type="button" role="tab" aria-selected={tab === "versions"} onClick={() => setTab("versions")}>Versions</button>
        <button type="button" role="tab" aria-selected={tab === "activity"} onClick={() => setTab("activity")}>Activity</button>
      </div>

      {error && <div className="auth-alert my-3" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}

      <div className="vt-history-body">
        {versions === null || events === null ? (
          !error && <p className="vt-note">Loading…</p>
        ) : tab === "versions" ? (
          versions.length === 0 ? (
            <p className="vt-note">No earlier values yet. When you change this secret’s value, the old one is kept here (up to the last 20).</p>
          ) : (
            <ul className="vt-versions">
              {versions.map((version) => {
                const shown = revealed[version.id];
                return (
                  <li key={version.id}>
                    <div className="vt-version-top">
                      <span>Replaced {formatDateTime(version.createdAt)}</span>
                      <span className="vt-version-buttons">
                        <Button type="button" variant="ghost" size="icon-xs" aria-label={shown !== undefined ? "Hide this old value" : "Reveal this old value"} onClick={() => toggleReveal(version.id)} disabled={busyId === version.id}>
                          {shown !== undefined ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                        </Button>
                        <Button type="button" variant="ghost" size="icon-xs" aria-label="Copy this old value" onClick={() => copy(version.id)} disabled={busyId === version.id}>
                          {copiedId === version.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                        </Button>
                        {canRestore && (
                          <Button type="button" variant="outline" size="xs" onClick={() => restore(version.id)} disabled={busyId === version.id}>
                            <RotateCcw aria-hidden="true" /> Restore
                          </Button>
                        )}
                      </span>
                    </div>
                    <code className={shown !== undefined ? "is-revealed" : undefined} aria-live="polite">{shown ?? "••••••••••••"}</code>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <ActivityList events={events} showSecret={false} />
        )}
      </div>
      {canRestore && <p className="vt-note">Restoring keeps the value it replaces in this list, so nothing is lost.</p>}
    </div>
  );
}
