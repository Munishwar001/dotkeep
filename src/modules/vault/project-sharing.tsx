"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleAlert, LogOut, UserMinus, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { PublicMember } from "@/db/members";
import { api, apiGet } from "./client-api";
import { ConfirmDialog } from "./confirm-dialog";
import { ROLE_LABELS } from "./constants";

const ROLE_HELP = { editor: "Editor: can add, change, move and delete secrets.", viewer: "Viewer: can look at secrets, copy and export them, but not change anything." } as const;

type Role = "editor" | "viewer";

/** Owner only: opens the list of people a project is shared with, and lets you add, change or remove them. */
export function ShareButton({ project }: { project: { id: string; name: string; memberCount: number } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Users aria-hidden="true" /> Share{project.memberCount > 0 ? ` · ${project.memberCount}` : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">{open && <ShareBody project={project} />}</DialogContent>
      </Dialog>
    </>
  );
}

function ShareBody({ project }: { project: { id: string; name: string } }) {
  const router = useRouter();
  const [members, setMembers] = useState<PublicMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState<PublicMember | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function load() {
    const result = await apiGet<{ members: PublicMember[] }>(`/api/vault/projects/${project.id}/members`);
    if (!result.ok) return setError(result.error);
    setMembers(result.data.members);
  }

  useEffect(() => {
    let cancelled = false;
    apiGet<{ members: PublicMember[] }>(`/api/vault/projects/${project.id}/members`).then((result) => {
      if (cancelled) return;
      if (!result.ok) return setError(result.error);
      setMembers(result.data.members);
    });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!email.trim()) return setError("Enter the email of the person to share with.");
    setPending(true);
    setError(null);
    const result = await api("POST", `/api/vault/projects/${project.id}/members`, { email, role });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setEmail("");
    await load();
    router.refresh();
  }

  async function changeRole(member: PublicMember, next: Role) {
    setError(null);
    const result = await api("PATCH", `/api/vault/projects/${project.id}/members/${member.userId}`, { role: next });
    if (!result.ok) return setError(result.error);
    await load();
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemovePending(true);
    setRemoveError(null);
    const result = await api("DELETE", `/api/vault/projects/${project.id}/members/${removing.userId}`);
    setRemovePending(false);
    if (!result.ok) return setRemoveError(result.error);
    setRemoving(null);
    await load();
    router.refresh();
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>Share “{project.name}”</DialogTitle>
        <DialogDescription>
          People you add can open this project and its secrets. They need a verified Dotkeep account. Everything they do shows up in the activity log.
        </DialogDescription>
      </DialogHeader>

      <form className="vt-invite" onSubmit={invite} noValidate>
        <Input type="email" className="h-10" placeholder="teammate@company.com" aria-label="Email address" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        <NativeSelect aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <NativeSelectOption value="editor">Editor</NativeSelectOption>
          <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" className="h-10" disabled={pending}><UserPlus aria-hidden="true" /> {pending ? "Adding…" : "Add"}</Button>
      </form>
      <p className="vt-note">{ROLE_HELP[role]}</p>

      {error && <div className="auth-alert my-3" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}

      <ul className="vt-members">
        {members === null ? (
          !error && <li className="vt-note">Loading…</li>
        ) : (
          members.map((member) => (
            <li key={member.userId}>
              <div>
                <b>{member.name}</b>
                <small>{member.email}</small>
              </div>
              {member.role === "owner" ? (
                <span className="vt-role">{ROLE_LABELS.owner}</span>
              ) : (
                <div className="vt-member-actions">
                  <NativeSelect size="sm" aria-label={`Role of ${member.name}`} value={member.role} onChange={(e) => changeRole(member, e.target.value as Role)}>
                    <NativeSelectOption value="editor">Editor</NativeSelectOption>
                    <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
                  </NativeSelect>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${member.name}`} onClick={() => { setRemoveError(null); setRemoving(member); }}>
                    <UserMinus aria-hidden="true" />
                  </Button>
                </div>
              )}
            </li>
          ))
        )}
      </ul>
      <p className="vt-note">Removing someone stops their access right away. They may still have copies of values they already saw, so change those secrets if that matters.</p>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => !next && setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}?`}
        description="They will no longer be able to open this project or its secrets."
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={removePending}
        error={removeError}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

/** For someone a project was shared with: stop having access to it. */
export function LeaveProjectButton({ project, userId }: { project: { id: string; name: string }; userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setPending(true);
    setError(null);
    const result = await api("DELETE", `/api/vault/projects/${project.id}/members/${userId}`);
    setPending(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    router.push("/dashboard/projects");
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => { setError(null); setOpen(true); }}><LogOut aria-hidden="true" /> Leave project</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Leave “${project.name}”?`}
        description="You will lose access to this project and its secrets. The owner can add you again."
        confirmLabel="Leave project"
        pendingLabel="Leaving…"
        pending={pending}
        error={error}
        onConfirm={leave}
      />
    </>
  );
}
