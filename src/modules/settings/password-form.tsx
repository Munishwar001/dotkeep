"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { api } from "@/modules/vault/client-api";
import { PasswordField } from "./password-field";
import { StatusNote, type Status } from "./status-note";

const MIN_LENGTH = 8;

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setStatus({ kind: "idle" });
  };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "saving") return;
    if (!current) return setStatus({ kind: "error", message: "Enter your current password." });
    if (next.length < MIN_LENGTH) return setStatus({ kind: "error", message: `Use at least ${MIN_LENGTH} characters for the new password.` });
    if (next === current) return setStatus({ kind: "error", message: "The new password must be different from the current one." });
    if (next !== confirm) return setStatus({ kind: "error", message: "The new passwords don’t match." });

    setStatus({ kind: "saving" });
    const result = await api<{ signedOut: number }>("POST", "/api/account/password", { currentPassword: current, newPassword: next });
    if (!result.ok) return setStatus({ kind: "error", message: result.error });

    setCurrent("");
    setNext("");
    setConfirm("");
    const others = result.data.signedOut;
    setStatus({
      kind: "saved",
      message: others > 0 ? `Password updated. ${others} other ${others === 1 ? "device was" : "devices were"} signed out.` : "Password updated.",
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={status.kind === "saving"}>
      <FieldGroup>
        <PasswordField id="current-password" label="Current password" autoComplete="current-password" value={current} onChange={edit(setCurrent)} />
        <PasswordField id="new-password" label="New password" autoComplete="new-password" placeholder="At least 8 characters" value={next} onChange={edit(setNext)} />
        <PasswordField id="confirm-password" label="Confirm new password" autoComplete="new-password" value={confirm} onChange={edit(setConfirm)} />
        <div className="st-actions">
          <Button type="submit" disabled={status.kind === "saving"}>{status.kind === "saving" ? "Updating…" : "Update password"}</Button>
          <StatusNote status={status} />
        </div>
        <p className="st-hint">Changing your password signs you out on every other device.</p>
      </FieldGroup>
    </form>
  );
}
