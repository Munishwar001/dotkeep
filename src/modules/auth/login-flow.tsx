"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { AuthForm } from "./auth-form";
import { RegisteredNotice } from "./registered-notice";
import { TwoFactorStep } from "./two-factor-step";

/**
 * The login page body: the password form, then (if the account has two-factor on) the code step.
 * Google sign-in lands on the code step directly, through ?twofactor=1.
 */
export function LoginFlow({ google }: { google: React.ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [codeStep, setCodeStep] = useState(params.get("twofactor") === "1");
  const [message, setMessage] = useState<string | null>(null);

  function backToPassword(note?: string) {
    setCodeStep(false);
    setMessage(note ?? null);
    router.replace("/login"); // drops ?twofactor=1
  }

  if (codeStep) return <TwoFactorStep onBack={backToPassword} />;
  return (
    <>
      {message && <div className="auth-alert" role="alert" style={{ marginBottom: 16 }}><CircleAlert aria-hidden="true" /><p>{message}</p></div>}
      <RegisteredNotice />
      {google}
      <AuthForm mode="login" onTwoFactor={() => setCodeStep(true)} />
    </>
  );
}
