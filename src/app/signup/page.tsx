import type { Metadata } from "next";
import { AuthForm } from "@/modules/auth/auth-form";
import { AuthShell } from "@/modules/auth/auth-shell";

export const metadata: Metadata = {
  title: "Create your account — Dotkeep",
  description: "Dotkeep is in its early stages. Accounts aren’t live yet.",
};

export default function SignupPage() {
  return (
    <AuthShell mode="signup">
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
