import type { Metadata } from "next";
import { Suspense } from "react";
import { isGoogleConfigured } from "@/lib/google-oauth";
import { AuthForm } from "@/modules/auth/auth-form";
import { AuthShell } from "@/modules/auth/auth-shell";
import { GoogleButton } from "@/modules/auth/google-button";
import { RegisteredNotice } from "@/modules/auth/registered-notice";

export const metadata: Metadata = {
  title: "Sign in — Dotkeep",
  description: "Sign in to your Dotkeep workspace.",
};

export default function LoginPage() {
  return (
    <AuthShell mode="login">
      {/* Reads the URL (?registered=1), so it needs a Suspense boundary; the rest of the page stays static. */}
      <Suspense fallback={null}>
        <RegisteredNotice />
      </Suspense>
      {isGoogleConfigured() && <GoogleButton />}
      <AuthForm mode="login" />
    </AuthShell>
  );
}
