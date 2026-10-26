"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The one click that actually confirms the email (see the note in /api/auth/verify-email). */
export function VerifyEmailButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (response.ok) {
        router.push("/login?verified=1");
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
    <div className="auth-form">
      <p className="auth-lead" style={{ margin: 0 }}>Press the button to confirm that this email address is yours.</p>
      {error && <div className="auth-alert" role="alert"><CircleAlert aria-hidden="true" /><p>{error}</p></div>}
      <Button type="button" size="lg" className="h-11 w-full text-[13px]" onClick={onClick} disabled={pending}>
        {pending ? "Verifying…" : "Verify my email"}
      </Button>
    </div>
  );
}
