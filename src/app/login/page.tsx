import type { Metadata } from "next";
import { Suspense } from "react";
import { isGoogleConfigured } from "@/lib/google-oauth";
import { AuthShell } from "@/modules/auth/auth-shell";
import { GoogleButton } from "@/modules/auth/google-button";
import { LoginFlow } from "@/modules/auth/login-flow";

export const metadata: Metadata = {
  title: "Sign in — Dotkeep",
  description: "Sign in to your Dotkeep workspace.",
};

export default function LoginPage() {
  return (
    <AuthShell mode="login">
      {/* Reads the URL (?registered=1, ?twofactor=1), so it needs a Suspense boundary; the rest of the page stays static. */}
      <Suspense fallback={null}>
        <LoginFlow google={isGoogleConfigured() ? <GoogleButton /> : null} />
      </Suspense>
    </AuthShell>
  );
}
