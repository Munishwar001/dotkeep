"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** The second step of signing in: the password (or Google) was right, now the code from the authenticator app. */
export function TwoFactorStep({ onBack }: { onBack: (message?: string) => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!code.trim()) return setError("Enter the code from your authenticator app.");

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (response.ok) {
        router.push("/dashboard");
        router.refresh();
        return; // keep the button disabled while the page changes
      }
      // Too many wrong codes, or too long a wait: the challenge is gone, so start over from the password.
      if (data?.code === "challenge_expired") return onBack(data.error);
      setError(data?.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("We couldn’t reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate aria-busy={pending}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="two-factor-code">Authentication code</FieldLabel>
          <Input id="two-factor-code" name="code" className="h-10" autoFocus autoComplete="one-time-code" inputMode="text" placeholder="123456" value={code} onChange={(e) => { setCode(e.target.value); setError(null); }} />
          <FieldDescription>Open your authenticator app and enter the 6-digit code. Lost your phone? Enter one of your recovery codes instead.</FieldDescription>
        </Field>
        {error && <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}
        <Button type="submit" size="lg" className="h-11 w-full text-[13px]" disabled={pending}>{pending ? "Verifying…" : "Verify"}</Button>
        <button type="button" className="auth-back-link" onClick={() => onBack()}>Back to sign in</button>
      </FieldGroup>
    </form>
  );
}
