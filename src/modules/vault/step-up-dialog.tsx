"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, registerStepUp } from "./client-api";

/**
 * Mounted once in the dashboard layout. When the server asks for a 2FA code before it reveals or exports a secret,
 * api() calls the function registered here, this dialog opens, and api() carries on (or gives up) with the answer.
 */
export function StepUpDialog() {
  const [open, setOpen] = useState(false);
  // Several requests can ask at once (e.g. two clicks): they all wait on the same dialog.
  const pending = useRef<{ promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null);

  useEffect(() => {
    registerStepUp(() => {
      if (!pending.current) {
        let resolve!: (ok: boolean) => void;
        const promise = new Promise<boolean>((r) => (resolve = r));
        pending.current = { promise, resolve };
        setOpen(true);
      }
      return pending.current.promise;
    });
    return () => registerStepUp(null);
  }, []);

  function finish(ok: boolean) {
    pending.current?.resolve(ok);
    pending.current = null;
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish(false)}>
      <DialogContent className="sm:max-w-sm">
        {/* Created fresh each time it opens, so a typed code never lingers. */}
        <StepUpForm onDone={finish} />
      </DialogContent>
    </Dialog>
  );
}

function StepUpForm({ onDone }: { onDone: (ok: boolean) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!code.trim()) return setError("Enter the code from your authenticator app.");
    setBusy(true);
    setError(null);
    const result = await api("POST", "/api/account/2fa/verify", { code });
    if (result.ok) return onDone(true);
    setError(result.error);
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy}>
      <DialogHeader>
        <DialogTitle>Confirm it’s you</DialogTitle>
        <DialogDescription>
          Enter the 6-digit code from your authenticator app to view or export secrets. You won’t be asked again for a few minutes.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-5">
        <Field>
          <FieldLabel htmlFor="step-up-code">Authentication code</FieldLabel>
          <Input id="step-up-code" className="h-10" autoFocus autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => { setCode(e.target.value); setError(null); }} />
        </Field>
        {error && <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(false)} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify"}</Button>
      </DialogFooter>
    </form>
  );
}
