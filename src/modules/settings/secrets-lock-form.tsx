"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/modules/vault/client-api";
import { PasswordField } from "./password-field";
import { StatusNote, type Status } from "./status-note";

/**
 * Settings -> "Protect secret values": when on, revealing, copying or exporting a secret asks for a 2FA code first
 * (then not again for a few minutes). It's opt-in and only available while two-factor authentication is on.
 */
export function SecretsLockForm({ twoFactorEnabled, enabled }: { twoFactorEnabled: boolean; enabled: boolean }) {
  const router = useRouter();
  const [turningOff, setTurningOff] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const saving = status.kind === "saving";

  if (!twoFactorEnabled) {
    return <p className="st-hint">Turn on two-factor authentication above to use this.</p>;
  }

  function cancel() {
    setTurningOff(false);
    setPassword("");
    setCode("");
    setStatus({ kind: "idle" });
  }

  async function turnOn() {
    if (saving) return;
    setStatus({ kind: "saving" });
    const result = await api("POST", "/api/account/2fa/secrets-lock", { enabled: true });
    if (!result.ok) return setStatus({ kind: "error", message: result.error });
    setStatus({ kind: "saved", message: "On. You’ll be asked for a code before secrets are shown." });
    router.refresh();
  }

  async function turnOff(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!password || !code.trim()) return setStatus({ kind: "error", message: "Enter your password and a code." });
    setStatus({ kind: "saving" });
    const result = await api("POST", "/api/account/2fa/secrets-lock", { enabled: false, password, code });
    if (!result.ok) return setStatus({ kind: "error", message: result.error });
    cancel();
    setStatus({ kind: "saved", message: "Off." });
    router.refresh();
  }

  if (enabled && turningOff) {
    return (
      <form onSubmit={turnOff} noValidate aria-busy={saving}>
        <FieldGroup>
          <PasswordField id="sl-password" label="Your password" autoComplete="current-password" value={password} onChange={(v) => { setPassword(v); setStatus({ kind: "idle" }); }} />
          <Field>
            <FieldLabel htmlFor="sl-code">Code from your app, or a recovery code</FieldLabel>
            <Input id="sl-code" className="h-10" autoComplete="one-time-code" value={code} onChange={(e) => { setCode(e.target.value); setStatus({ kind: "idle" }); }} />
          </Field>
          <div className="st-actions">
            <Button type="submit" variant="destructive" disabled={saving}>{saving ? "Turning off…" : "Turn off"}</Button>
            <Button type="button" variant="outline" onClick={cancel} disabled={saving}>Cancel</Button>
            <StatusNote status={status} />
          </div>
        </FieldGroup>
      </form>
    );
  }

  return enabled ? (
    <FieldGroup>
      <p className="st-verified"><ShieldCheck aria-hidden="true" /> Secrets ask for a code before they’re shown.</p>
      <div className="st-actions">
        <Button type="button" variant="outline" onClick={() => { setStatus({ kind: "idle" }); setTurningOff(true); }}>Turn off</Button>
        <StatusNote status={status} />
      </div>
    </FieldGroup>
  ) : (
    <FieldGroup>
      <div className="st-actions">
        <Button type="button" onClick={turnOn} disabled={saving}>{saving ? "Turning on…" : "Turn on"}</Button>
        <StatusNote status={status} />
      </div>
      <p className="st-hint">Applies to Reveal, Copy and Export. After you enter a code you won’t be asked again for 10 minutes.</p>
    </FieldGroup>
  );
}
