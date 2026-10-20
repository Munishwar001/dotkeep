"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PublicSession } from "@/db/sessions";
import { api } from "@/modules/vault/client-api";
import { formatDate } from "@/modules/vault/format";
import { StatusNote, type Status } from "./status-note";

export function SessionsList({ sessions }: { sessions: PublicSession[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const others = sessions.filter((session) => !session.current);

  async function revoke(session: PublicSession) {
    setBusy(session.id);
    setStatus({ kind: "idle" });
    const result = await api("DELETE", `/api/account/sessions/${session.id}`);
    setBusy(null);
    if (!result.ok) return setStatus({ kind: "error", message: result.error });
    setStatus({ kind: "saved", message: `Signed out ${session.label}.` });
    router.refresh();
  }

  async function revokeOthers() {
    setBusy("others");
    setStatus({ kind: "idle" });
    const result = await api<{ signedOut: number }>("DELETE", "/api/account/sessions/others");
    setBusy(null);
    if (!result.ok) return setStatus({ kind: "error", message: result.error });
    setStatus({ kind: "saved", message: `Signed out ${result.data.signedOut} other ${result.data.signedOut === 1 ? "device" : "devices"}.` });
    router.refresh();
  }

  return (
    <div>
      <ul className="st-sessions">
        {sessions.map((session) => (
          <li key={session.id}>
            <span className="st-session-icon"><Laptop aria-hidden="true" /></span>
            <span className="st-session-main">
              <b>{session.label} {session.current && <em className="st-badge">This device</em>}</b>
              <small>Signed in {formatDate(session.createdAt)} · expires {formatDate(session.expiresAt)}</small>
            </span>
            {!session.current && (
              <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => revoke(session)}>
                {busy === session.id ? "Signing out…" : "Sign out"}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <div className="st-actions st-sessions-foot">
        {others.length > 0 && (
          <Button type="button" variant="outline" disabled={busy !== null} onClick={revokeOthers}>
            {busy === "others" ? "Signing out…" : "Sign out everywhere else"}
          </Button>
        )}
        <StatusNote status={status} />
      </div>
    </div>
  );
}
