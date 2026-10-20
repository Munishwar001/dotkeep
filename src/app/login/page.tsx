import type { Metadata } from "next";
import { AuthForm } from "@/modules/auth/auth-form";
import { AuthShell } from "@/modules/auth/auth-shell";

export const metadata: Metadata = {
  title: "Sign in — Dotkeep",
  description: "Sign in to your Dotkeep workspace.",
};

export default function LoginPage() {
  return (
    <AuthShell mode="login">
      <AuthForm mode="login" />
    </AuthShell>
  );
}
