"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, EyeOff, Eye, MoreHorizontal, ShieldOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/modules/vault/client-api";
import { ConfirmDialog } from "@/modules/vault/confirm-dialog";

type Target = { id: string; name: string; blocked: boolean };
type Action = "block" | "delete";

/** The "..." menu on a user row: block or unblock, delete. Not shown for admins or for yourself. */
export function UserActions({ user }: { user: Target }) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);

  async function unblock() {
    setMenuError(null);
    const result = await api("PATCH", `/api/admin/users/${user.id}`, { blocked: false });
    if (!result.ok) return setMenuError(result.error);
    router.refresh();
  }

  async function confirm() {
    if (!action) return;
    setPending(true);
    setError(null);
    const result =
      action === "block"
        ? await api("PATCH", `/api/admin/users/${user.id}`, { blocked: true })
        : await api("DELETE", `/api/admin/users/${user.id}`);
    setPending(false);
    if (!result.ok) return setError(result.error);
    setAction(null);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="vt-icon-button" aria-label={`Actions for ${user.name}`}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {user.blocked ? (
            <DropdownMenuItem onClick={unblock}><ShieldOff aria-hidden="true" /> Unblock</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => { setError(null); setAction("block"); }}><Ban aria-hidden="true" /> Block</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => { setError(null); setAction("delete"); }}><Trash2 aria-hidden="true" /> Delete account</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {menuError && <span className="sr-only" role="alert">{menuError}</span>}

      <ConfirmDialog
        open={action === "block"}
        onOpenChange={(open) => !open && setAction(null)}
        title={`Block ${user.name}?`}
        description="They are logged out everywhere right away and can’t sign in until you unblock them. Their projects and secrets are kept."
        confirmLabel="Block user"
        pendingLabel="Blocking…"
        pending={pending}
        error={error}
        onConfirm={confirm}
      />
      <ConfirmDialog
        open={action === "delete"}
        onOpenChange={(open) => !open && setAction(null)}
        title={`Delete ${user.name}?`}
        description="This permanently deletes their account, all their projects and secrets (including projects shared with others), and removes them from projects shared with them. This can’t be undone. Blocking is the reversible option."
        confirmLabel="Delete account"
        pending={pending}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}

/** Switches the user list between real and masked emails. The masking happens on the server. */
export function MaskEmailsToggle({ masked }: { masked: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    const result = await api("PATCH", "/api/admin/preferences", { maskEmails: !masked });
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="ad-mask">
      <Button type="button" variant="outline" size="sm" aria-pressed={masked} onClick={toggle} disabled={pending}>
        {masked ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />} {masked ? "Show emails" : "Mask emails"}
      </Button>
      {error && <span className="ad-mask-error" role="alert">{error}</span>}
    </div>
  );
}
