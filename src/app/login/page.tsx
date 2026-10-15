import type { Metadata } from "next";
import { AuthForm } from "@/modules/auth/auth-form";
import { AuthShell } from "@/modules/auth/auth-shell";

export const metadata: Metadata = {
  title: "Sign in — Dotkeep",
  description: "Dotkeep is in its early stages. Accounts aren’t live yet.",
};

export default function LoginPage() {
  return (
    <AuthShell mode="login">
      <AuthForm mode="login" />
    </AuthShell>
  );
}
