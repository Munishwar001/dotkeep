"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/modules/vault/client-api";
import { PasswordField } from "./password-field";
import { StatusNote, type Status } from "./status-note";

// idle: the resting state (on or off). password -> scan: turning it on. codes: the one-time recovery codes.
// disable / regenerate: both ask for the password and a current code.
type Step = "idle" | "password" | "scan" | "codes" | "disable" | "regenerate";

export function TwoFactorForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const saving = status.kind === "saving";

  function go(next: Step) {
    setStep(next);
    setPassword("");
    setCode("");
    setStatus({ kind: "idle" });
  }

  /** Runs a request and, on success, hands the data to `then`. Errors show under the form. */
  async function run<T>(url: string, body: unknown, then: (data: T) => void) {
    if (saving) return;
    setStatus({ kind: "saving" });
    const result = await api<T>("POST", url, body);
    if (!result.ok) return setStatus({ kind: "error", message: result.error });
    setStatus({ kind: "idle" });
    then(result.data);
  }

  function onPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!password) return setStatus({ kind: "error", message: "Enter your password." });
    run<{ secret: string; qr: string }>("/api/account/2fa/setup", { password }, (data) => {
      setSetup(data);
      setPassword("");
      setStep("scan");
    });
  }

  function onScan(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) return setStatus({ kind: "error", message: "Enter the 6-digit code from your app." });
    run<{ recoveryCodes: string[] }>("/api/account/2fa/enable", { code }, (data) => {
      setRecoveryCodes(data.recoveryCodes);
      setSetup(null);
      setCode("");
      setStep("codes");
      router.refresh(); // the page now knows 2FA is on
    });
  }

  function onProve(event: React.FormEvent) {
    event.preventDefault();
    if (!password || !code.trim()) return setStatus({ kind: "error", message: "Enter your password and a code." });
    if (step === "disable") {
      run("/api/account/2fa/disable", { password, code }, () => {
        go("idle");
        setStatus({ kind: "saved", message: "Two-factor authentication is off." });
        router.refresh();
      });
    } else {
      run<{ recoveryCodes: string[] }>("/api/account/2fa/recovery-codes", { password, code }, (data) => {
        setRecoveryCodes(data.recoveryCodes);
        go("codes");
      });
    }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
    } catch {
      setStatus({ kind: "error", message: "Couldn’t copy. Select the codes and copy them by hand." });
    }
  }

  if (step === "codes") {
    return (
      <FieldGroup>
        <Field>
          <FieldLabel>Your recovery codes</FieldLabel>
          <ul className="st-codes" aria-label="Recovery codes">
            {recoveryCodes.map((value) => <li key={value}>{value}</li>)}
          </ul>
          <FieldDescription>Save these somewhere safe, like a password manager. Each code works once if you lose your phone. They won’t be shown again.</FieldDescription>
        </Field>
        <div className="st-actions">
          <Button type="button" variant="outline" onClick={copyCodes}><Copy aria-hidden="true" /> {copied ? "Copied" : "Copy codes"}</Button>
          <Button type="button" onClick={() => { setRecoveryCodes([]); setCopied(false); go("idle"); router.refresh(); }}>I’ve saved them</Button>
          <StatusNote status={status} />
        </div>
      </FieldGroup>
    );
  }

  if (step === "password") {
    return (
      <form onSubmit={onPassword} noValidate aria-busy={saving}>
        <FieldGroup>
          <PasswordField id="tf-password" label="Confirm your password" autoComplete="current-password" value={password} onChange={(v) => { setPassword(v); setStatus({ kind: "idle" }); }} />
          <div className="st-actions">
            <Button type="submit" disabled={saving}>{saving ? "Checking…" : "Continue"}</Button>
            <Button type="button" variant="outline" onClick={() => go("idle")} disabled={saving}>Cancel</Button>
            <StatusNote status={status} />
          </div>
        </FieldGroup>
      </form>
    );
  }

  if (step === "scan" && setup) {
    return (
      <form onSubmit={onScan} noValidate aria-busy={saving}>
        <FieldGroup>
          <Field>
            <FieldLabel>1. Scan this with your authenticator app</FieldLabel>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL, nothing to optimize */}
            <img className="st-qr" src={setup.qr} alt="QR code for your authenticator app" width={140} height={140} />
            <FieldDescription>Can’t scan it? Enter this key in your app instead: <code className="st-key">{setup.secret}</code></FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="tf-code">2. Enter the 6-digit code it shows</FieldLabel>
            <Input id="tf-code" className="h-10" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={7} value={code} onChange={(e) => { setCode(e.target.value); setStatus({ kind: "idle" }); }} />
          </Field>
          <div className="st-actions">
            <Button type="submit" disabled={saving}>{saving ? "Verifying…" : "Verify and turn on"}</Button>
            <Button type="button" variant="outline" onClick={() => { setSetup(null); go("idle"); }} disabled={saving}>Cancel</Button>
            <StatusNote status={status} />
          </div>
        </FieldGroup>
      </form>
    );
  }

  if (step === "disable" || step === "regenerate") {
    return (
      <form onSubmit={onProve} noValidate aria-busy={saving}>
        <FieldGroup>
          <PasswordField id="tf-password" label="Your password" autoComplete="current-password" value={password} onChange={(v) => { setPassword(v); setStatus({ kind: "idle" }); }} />
          <Field>
            <FieldLabel htmlFor="tf-code">Code from your app, or a recovery code</FieldLabel>
            <Input id="tf-code" className="h-10" autoComplete="one-time-code" value={code} onChange={(e) => { setCode(e.target.value); setStatus({ kind: "idle" }); }} />
          </Field>
          <div className="st-actions">
            <Button type="submit" variant={step === "disable" ? "destructive" : "default"} disabled={saving}>
              {step === "disable" ? (saving ? "Turning off…" : "Turn off") : saving ? "Working…" : "Get new codes"}
            </Button>
            <Button type="button" variant="outline" onClick={() => go("idle")} disabled={saving}>Cancel</Button>
            <StatusNote status={status} />
          </div>
          {step === "regenerate" && <p className="st-hint">Your old recovery codes stop working.</p>}
        </FieldGroup>
      </form>
    );
  }

  return enabled ? (
    <FieldGroup>
      <p className="st-verified"><ShieldCheck aria-hidden="true" /> Two-factor authentication is on.</p>
      <div className="st-actions">
        <Button type="button" variant="outline" onClick={() => go("regenerate")}>New recovery codes</Button>
        <Button type="button" variant="destructive" onClick={() => go("disable")}>Turn off</Button>
        <StatusNote status={status} />
      </div>
    </FieldGroup>
  ) : (
    <FieldGroup>
      <div className="st-actions">
        <Button type="button" onClick={() => go("password")}>Turn on</Button>
        <StatusNote status={status} />
      </div>
      <p className="st-hint">You’ll need an authenticator app such as Google Authenticator, Authy or 1Password.</p>
    </FieldGroup>
  );
}
