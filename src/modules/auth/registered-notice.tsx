"use client";

import { useSearchParams } from "next/navigation";
import { CircleAlert, CircleCheck } from "lucide-react";

/**
 * Notes at the top of the login page, driven by the URL:
 *   ?registered=1          just signed up, verification email sent
 *   ?registered=1&mail=0   just signed up, but the email could not be sent
 *   ?verified=1            just confirmed the email
 *   ?reset=1               just chose a new password
 */
export function RegisteredNotice() {
  const params = useSearchParams();

  if (params.get("reset") === "1") {
    return <Note>Password updated. Sign in with your new password.</Note>;
  }
  if (params.get("verified") === "1") {
    return <Note>Email verified. You can sign in now.</Note>;
  }
  if (params.get("registered") === "1") {
    return params.get("mail") === "0" ? (
      <Note tone="error">Your account is ready, but we couldn’t send the verification email. Try signing in and we’ll let you ask for a new one.</Note>
    ) : (
      <Note>Your account is ready. We sent a verification link to your email. Open it, then sign in.</Note>
    );
  }
  return null;
}

function Note({ tone = "ok", children }: { tone?: "ok" | "error"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CircleCheck : CircleAlert;
  return (
    <div className={tone === "ok" ? "auth-success" : "auth-alert"} role={tone === "ok" ? "status" : "alert"} style={tone === "error" ? { marginBottom: 20 } : undefined}>
      <Icon aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
