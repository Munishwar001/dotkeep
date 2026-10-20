"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { PasswordField } from "@/modules/settings/password-field";

const MIN_LENGTH = 8;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError("The passwords don’t match.");

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) {
        router.push("/login?reset=1");
        return; // keep the button disabled while the page changes
      }
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("We couldn’t reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate aria-busy={pending}>
      <FieldGroup>
        <PasswordField id="new-password" label="New password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(v) => { setPassword(v); setError(null); }} />
        <PasswordField id="confirm-password" label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(v) => { setConfirm(v); setError(null); }} />
        {error && <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}
        <Button type="submit" size="lg" className="h-11 w-full text-[13px]" disabled={pending}>{pending ? "Saving…" : "Set new password"}</Button>
        <p className="auth-notice-line">You’ll be signed out everywhere and asked to sign in with the new password.</p>
      </FieldGroup>
    </form>
  );
}
