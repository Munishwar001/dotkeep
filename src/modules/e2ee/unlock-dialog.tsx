"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { changePassphrase, unlockVault, WrongKeyError, type VaultKeyRecord } from "@/lib/e2ee";
import { PasswordField } from "@/modules/settings/password-field";
import { api, apiGet } from "@/modules/vault/client-api";
import { registerUnlock, setUnlocked } from "./vault-key";

/**
 * Mounted once in the dashboard layout, next to the 2FA step-up dialog. When something needs the vault key and the vault is
 * locked, vault-key.ts calls the function registered here: this dialog asks for the passphrase (or, if it is forgotten, the
 * recovery key plus a new passphrase) and the waiting request carries on, or gives up.
 */
export function UnlockDialog() {
  const [open, setOpen] = useState(false);
  const pending = useRef<{ promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null);

  useEffect(() => {
    registerUnlock(() => {
      if (!pending.current) {
        let resolve!: (ok: boolean) => void;
        const promise = new Promise<boolean>((r) => (resolve = r));
        pending.current = { promise, resolve };
        setOpen(true);
      }
      return pending.current.promise;
    });
    return () => registerUnlock(null);
  }, []);

  function finish(ok: boolean) {
    pending.current?.resolve(ok);
    pending.current = null;
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish(false)}>
      <DialogContent className="sm:max-w-md">
        {/* Created fresh each time it opens, so a typed passphrase never lingers. */}
        <UnlockForm onDone={finish} />
      </DialogContent>
    </Dialog>
  );
}

type Keys = { userId: string; record: VaultKeyRecord };

function UnlockForm({ onDone }: { onDone: (ok: boolean) => void }) {
  const [keys, setKeys] = useState<Keys | null>(null);
  const [forgot, setForgot] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ userId: string; record: VaultKeyRecord | null }>("/api/account/e2ee").then((result) => {
      if (cancelled) return;
      if (result.ok && result.data.record) setKeys({ userId: result.data.userId, record: result.data.record });
      else setError(result.ok ? "End-to-end encryption isn’t turned on for this account." : result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !keys) return;
    if (!passphrase) return setError(forgot ? "Choose a new passphrase." : "Enter your passphrase.");
    if (forgot && !recoveryKey.trim()) return setError("Enter your recovery key.");

    setBusy(true);
    setError(null);
    try {
      if (forgot) {
        // The recovery key opens the vault, and we wrap the same vault key again with the new passphrase.
        const next = await changePassphrase(keys.record, { recoveryKey }, passphrase);
        const saved = await api("PATCH", "/api/account/e2ee", { record: next.record });
        if (!saved.ok) throw new Error(saved.error);
        setUnlocked(next.vaultKey, keys.userId);
      } else {
        setUnlocked(await unlockVault(keys.record, { passphrase }), keys.userId);
      }
      onDone(true);
    } catch (failure) {
      setError(failure instanceof WrongKeyError || failure instanceof Error ? failure.message : "Couldn’t unlock the vault.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy}>
      <DialogHeader>
        <DialogTitle>{forgot ? "Reset your passphrase" : "Unlock your vault"}</DialogTitle>
        <DialogDescription>
          {forgot
            ? "Enter the recovery key you saved when you turned on end-to-end encryption, and choose a new passphrase."
            : "Your secrets are end-to-end encrypted. Enter your vault passphrase to read or save them. It never leaves this browser."}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-5">
        {forgot && (
          <Field>
            <FieldLabel htmlFor="unlock-recovery">Recovery key</FieldLabel>
            <Input id="unlock-recovery" className="h-10 font-mono" autoComplete="off" spellCheck={false} placeholder="XXXXXXXX-XXXXXXXX-…" value={recoveryKey} onChange={(e) => { setRecoveryKey(e.target.value); setError(null); }} />
          </Field>
        )}
        <PasswordField id="unlock-passphrase" label={forgot ? "New passphrase" : "Vault passphrase"} autoComplete={forgot ? "new-password" : "current-password"} value={passphrase} onChange={(v) => { setPassphrase(v); setError(null); }} />
        {forgot && <FieldDescription>At least 12 characters. Your recovery key stays the same.</FieldDescription>}
        {error && <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}
        <button type="button" className="auth-link" onClick={() => { setForgot((f) => !f); setError(null); setPassphrase(""); }}>
          {forgot ? "Back to passphrase" : "Forgot your passphrase?"}
        </button>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(false)} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy || !keys}>{busy ? "Unlocking…" : forgot ? "Reset and unlock" : "Unlock"}</Button>
      </DialogFooter>
    </form>
  );
}
