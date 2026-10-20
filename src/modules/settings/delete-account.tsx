"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { api } from "@/modules/vault/client-api";
import { PasswordField } from "./password-field";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>Delete account</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {/* Created fresh each time it opens, so a typed password never lingers. */}
          <DeleteForm onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!password) return setError("Enter your password to confirm.");

    setPending(true);
    setError(null);
    const result = await api("DELETE", "/api/account", { password });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push("/"); // the account is gone, so go back to the landing page
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending}>
      <DialogHeader>
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogDescription>
          This permanently deletes your account, all your projects and secrets, and signs you out everywhere. It can’t be undone.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-5">
        <PasswordField id="delete-password" label="Your password" autoComplete="current-password" value={password} onChange={(value) => { setPassword(value); setError(null); }} />
        {error && <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>Cancel</Button>
        <Button type="submit" variant="destructive" disabled={pending}>{pending ? "Deleting…" : "Delete my account"}</Button>
      </DialogFooter>
    </form>
  );
}
