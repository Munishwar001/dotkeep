import type { Metadata } from "next";
import { AuthShell } from "@/modules/auth/auth-shell";
import { ForgotPasswordForm } from "@/modules/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password — Dotkeep",
  description: "Get a link to choose a new Dotkeep password.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell mode="forgot">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
