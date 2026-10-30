"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert, Eye, EyeOff, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

type Mode = "login" | "signup";
type Values = { name: string; email: string; password: string };
type Errors = Partial<Record<keyof Values, string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(mode: Mode, v: Values): Errors {
  const errors: Errors = {};
  if (mode === "signup" && !v.name.trim()) errors.name = "Enter your name.";
  if (!v.email.trim()) errors.email = "Enter your email address.";
  else if (!emailPattern.test(v.email.trim())) errors.email = "Enter a valid email address.";
  if (!v.password) errors.password = "Enter your password.";
  else if (mode === "signup" && v.password.length < 8) errors.password = "Use at least 8 characters.";
  return errors;
}

function strength(password: string) {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;
  score = Math.max(score, 1);
  return { score, label: ["", "Weak", "Fair", "Good", "Strong"][score] };
}

export function AuthForm({ mode, onTwoFactor }: { mode: Mode; onTwoFactor?: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>({ name: "", email: "", password: "" });
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // After a correct password on an account whose email isn't verified yet: offer to send the link again.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const errors = validate(mode, values);
  const visible = (field: keyof Values) => (touched[field] || submitted ? errors[field] : undefined);
  const meter = strength(values.password);

  const set = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    setNotice(null);
    setFormError(null);
    setNeedsVerification(false);
    setResend("idle");
  };
  const blur = (field: keyof Values) => () => setTouched((prev) => ({ ...prev, [field]: true }));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return; // ignore double clicks
    setSubmitted(true);
    setNotice(null);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "signup" ? values : { email: values.email, password: values.password }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string; code?: string; emailSent?: boolean; twoFactorRequired?: boolean } | null;

      // Right password, but no session yet: the account wants a code from its authenticator app.
      if (response.ok && data?.twoFactorRequired) {
        onTwoFactor?.();
        return;
      }

      if (response.ok) {
        // Signing up only creates the account and emails a link; the person verifies, then signs in on the login page.
        // Signing in sets the session cookie, so go to the dashboard.
        router.push(mode === "signup" ? `/login?registered=1${data?.emailSent === false ? "&mail=0" : ""}` : "/dashboard");
        router.refresh();
        return; // keep the button disabled while the page changes
      }

      if (data?.code === "email_not_verified") setNeedsVerification(true);
      setFormError(data?.error ?? "Something went wrong. Please try again.");
    } catch {
      setFormError("We couldn’t reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  async function resendVerification() {
    setResend("sending");
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });
      setResend(response.ok ? "sent" : "error");
    } catch {
      setResend("error");
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate aria-busy={pending}>
      <FieldGroup>
        {mode === "signup" && (
          <Field data-invalid={!!visible("name")}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" name="name" autoComplete="name" placeholder="Your name" className="h-10" value={values.name} onChange={set("name")} onBlur={blur("name")} aria-invalid={!!visible("name")} />
            {visible("name") && <FieldError>{visible("name")}</FieldError>}
          </Field>
        )}

        <Field data-invalid={!!visible("email")}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" className="h-10" value={values.email} onChange={set("email")} onBlur={blur("email")} aria-invalid={!!visible("email")} />
          {visible("email") && <FieldError>{visible("email")}</FieldError>}
        </Field>

        <Field data-invalid={!!visible("password")}>
          <div className="auth-label-row">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            {mode === "login" && (
              <Link className="auth-link" href="/forgot-password">Forgot password?</Link>
            )}
          </div>
          <InputGroup className="h-10">
            <InputGroupInput id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} value={values.password} onChange={set("password")} onBlur={blur("password")} aria-invalid={!!visible("password")} />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {visible("password") && <FieldError>{visible("password")}</FieldError>}
          {mode === "signup" && (
            <div className="auth-meter" data-score={meter.score} aria-live="polite">
              <div className="auth-meter-bars" aria-hidden="true"><i /><i /><i /><i /></div>
              <span>{meter.label ? `${meter.label} password` : "Use 12+ characters with mixed case and a number."}</span>
            </div>
          )}
        </Field>

        {formError && (
          <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{formError}</p></div>
        )}
        {needsVerification && resend === "idle" && (
          <Button type="button" variant="outline" className="h-10 w-full" onClick={resendVerification}>Resend verification email</Button>
        )}
        {needsVerification && resend === "sending" && <p className="auth-notice-line">Sending…</p>}
        {needsVerification && resend === "sent" && (
          <div className="auth-success" style={{ marginBottom: 0 }} role="status"><Info aria-hidden="true" /><p>If your account is waiting for verification, a new link is on its way. It can take a minute.</p></div>
        )}
        {needsVerification && resend === "error" && <p className="auth-notice-line">We couldn’t send that. Please try again in a minute.</p>}
        {notice && (
          <div className="auth-notice" role="status"><Info aria-hidden="true" /><p>{notice}</p></div>
        )}

        <Button type="submit" size="lg" className="h-11 w-full text-[13px]" disabled={pending}>
          {pending ? (mode === "signup" ? "Creating account…" : "Signing in…") : mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
