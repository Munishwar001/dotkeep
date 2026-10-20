"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/modules/vault/client-api";
import { StatusNote, type Status } from "./status-note";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "saving") return;
    const next = value.trim();
    if (!next) return setStatus({ kind: "error", message: "Enter your name." });
    if (next === name) return setStatus({ kind: "saved", message: "That’s already your name." });

    setStatus({ kind: "saving" });
    const result = await api("PATCH", "/api/account/profile", { name: next });
    if (!result.ok) return setStatus({ kind: "error", message: result.error });
    setStatus({ kind: "saved", message: "Name updated." });
    router.refresh(); // the top bar and greeting use the new name
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={status.kind === "saving"}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="settings-name">Name</FieldLabel>
          <Input id="settings-name" className="h-10" autoComplete="name" maxLength={100} value={value} onChange={(e) => { setValue(e.target.value); setStatus({ kind: "idle" }); }} />
        </Field>
        <Field>
          <FieldLabel htmlFor="settings-email">Email</FieldLabel>
          <Input id="settings-email" className="h-10" value={email} disabled readOnly />
          <FieldDescription>Changing your email isn’t available yet.</FieldDescription>
        </Field>
        <div className="st-actions">
          <Button type="submit" disabled={status.kind === "saving"}>{status.kind === "saving" ? "Saving…" : "Save name"}</Button>
          <StatusNote status={status} />
        </div>
      </FieldGroup>
    </form>
  );
}
