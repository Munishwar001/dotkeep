import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isGoogleConfigured } from "@/lib/google-oauth";
import { AuthForm } from "@/modules/auth/auth-form";
import { AuthShell } from "@/modules/auth/auth-shell";
import { RedirectIfSignedIn } from "@/modules/auth/redirect-if-signed-in";
import { GoogleButton } from "@/modules/auth/google-button";

export const metadata: Metadata = {
  title: "Create your account — Dotkeep",
  description: "Create your Dotkeep account.",
};

export default function SignupPage() {
  return (
    <AuthShell mode="signup">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      {isGoogleConfigured() && <GoogleButton label="Sign up with Google" />}
      <AuthForm mode="signup" />
      <p className="legal-consent">By creating an account you agree to our <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>
    </AuthShell>
  );
}
