import type { Metadata } from "next";
import { isGoogleConfigured } from "@/lib/google-oauth";
import { AuthForm } from "@/modules/auth/auth-form";
import { AuthShell } from "@/modules/auth/auth-shell";
import { GoogleButton } from "@/modules/auth/google-button";

export const metadata: Metadata = {
  title: "Create your account — Dotkeep",
  description: "Create your Dotkeep account.",
};

export default function SignupPage() {
  return (
    <AuthShell mode="signup">
      {isGoogleConfigured() && <GoogleButton label="Sign up with Google" />}
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
