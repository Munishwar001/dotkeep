import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { isPasswordResetValid } from "@/db/password-resets";
import { AuthShell } from "@/modules/auth/auth-shell";
import { ResetPasswordForm } from "@/modules/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password — Dotkeep",
  robots: { index: false },
  referrer: "no-referrer", // the link carries a one-time token; don't pass it on to other sites
};

type SearchParams = Promise<{ token?: string }>;

// The token is in the URL (request-time data), so this is read inside a Suspense boundary.
// Opening the page only CHECKS the token. Using it up takes submitting the new password.
async function ResetContent({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;
  const valid = token && token.length <= 200 ? await isPasswordResetValid(token).catch(() => false) : false;

  if (!valid || !token) {
    return (
      <div className="auth-form">
        <div className="auth-alert" role="alert">
          <CircleAlert aria-hidden="true" />
          <p>This link is invalid or has expired. Reset links work once and last 1 hour.</p>
        </div>
        <Link className="auth-back-link" href="/forgot-password">Request a new link</Link>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AuthShell mode="reset">
      <Suspense fallback={<p className="auth-lead">Checking your link…</p>}>
        <ResetContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
