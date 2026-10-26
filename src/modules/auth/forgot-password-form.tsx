"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const error = !email.trim() ? "Enter your email address." : !emailPattern.test(email.trim()) ? "Enter a valid email address." : undefined;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setTouched(true);
    setFormError(null);
    if (error) return;

    setPending(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (response.ok) {
        setSentTo(email.trim());
      } else {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setFormError(data?.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("We couldn’t reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  // The same message is shown for every address, so it never reveals whether an account exists.
  if (sentTo) {
    return (
      <div className="auth-form">
        <div className="auth-success" style={{ marginBottom: 0 }} role="status">
          <CircleCheck aria-hidden="true" />
          <p>If {sentTo} has an account, we’ve sent a link to reset the password. It can take a minute, and it expires in 1 hour.</p>
        </div>
        <p className="auth-notice-line">Nothing arrived? Check your spam folder, or <button type="button" className="auth-link" onClick={() => setSentTo(null)}>try again</button>.</p>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate aria-busy={pending}>
      <FieldGroup>
        <Field data-invalid={touched && !!error}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" className="h-10" value={email} onChange={(e) => { setEmail(e.target.value); setFormError(null); }} onBlur={() => setTouched(true)} aria-invalid={touched && !!error} aria-describedby={touched && error ? "email-error" : undefined} />
          {touched && error && <FieldError id="email-error">{error}</FieldError>}
        </Field>

        {formError && <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{formError}</p></div>}

        <Button type="submit" size="lg" className="h-11 w-full text-[13px]" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>
      </FieldGroup>
    </form>
  );
}
