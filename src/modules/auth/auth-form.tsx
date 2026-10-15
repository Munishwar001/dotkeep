"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Info } from "lucide-react";
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

export function AuthForm({ mode }: { mode: Mode }) {
  const [values, setValues] = useState<Values>({ name: "", email: "", password: "" });
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const errors = validate(mode, values);
  const visible = (field: keyof Values) => (touched[field] || submitted ? errors[field] : undefined);
  const meter = strength(values.password);

  const set = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    setNotice(null);
  };
  const blur = (field: keyof Values) => () => setTouched((prev) => ({ ...prev, [field]: true }));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Intentionally no network call: accounts are not live yet, so nothing is sent or stored.
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      setNotice(null);
      return;
    }
    setNotice(
      mode === "signup"
        ? "Dotkeep isn’t open for sign-ups yet. Nothing was sent or saved — this page shows where your account will be created."
        : "Sign-in isn’t available yet because accounts aren’t live. Nothing was sent or saved.",
    );
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
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
              <button type="button" className="auth-link" onClick={() => setNotice("Password reset isn’t available yet because accounts aren’t live.")}>Forgot password?</button>
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

        {notice && (
          <div className="auth-notice" role="status"><Info aria-hidden="true" /><p>{notice}</p></div>
        )}

        <Button type="submit" size="lg" className="h-11 w-full text-[13px]">{mode === "signup" ? "Create account" : "Sign in"}</Button>
        <p className="auth-fineprint">Accounts aren’t live yet, so nothing you enter here is submitted. <Link href="/#faq">Learn more</Link></p>
      </FieldGroup>
    </form>
  );
}
