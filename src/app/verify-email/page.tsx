import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { isVerificationValid } from "@/db/email-verifications";
import { AuthShell } from "@/modules/auth/auth-shell";
import { VerifyEmailButton } from "@/modules/auth/verify-email-button";

export const metadata: Metadata = {
  title: "Verify your email — Dotkeep",
  robots: { index: false },
  referrer: "no-referrer", // the link carries a one-time token; don't pass it on to other sites
};

type SearchParams = Promise<{ token?: string }>;

// The token is in the URL (request-time data), so this is read inside a Suspense boundary.
// Opening the page only CHECKS the token. Using it up takes the button click.
async function VerifyContent({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;
  const valid = token && token.length <= 200 ? await isVerificationValid(token).catch(() => false) : false;

  if (!valid || !token) {
    return (
      <div className="auth-form">
        <div className="auth-alert" role="alert">
          <CircleAlert aria-hidden="true" />
          <p>This link is invalid or has expired. Sign in with your email and password and we’ll let you ask for a new one.</p>
        </div>
        <Link className="auth-back-link" href="/login">Go to sign in</Link>
      </div>
    );
  }
  return <VerifyEmailButton token={token} />;
}

export default function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AuthShell mode="verify">
      <Suspense fallback={<p className="auth-lead">Checking your link…</p>}>
        <VerifyContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
