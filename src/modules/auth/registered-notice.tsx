"use client";

import { useSearchParams } from "next/navigation";
import { CircleCheck } from "lucide-react";

/** Shown on the login page right after signing up (the signup form sends people to /login?registered=1). */
export function RegisteredNotice() {
  const params = useSearchParams();
  if (params.get("registered") !== "1") return null;

  return (
    <div className="auth-success" role="status">
      <CircleCheck aria-hidden="true" />
      <p>Your account is ready. Sign in to continue.</p>
    </div>
  );
}
