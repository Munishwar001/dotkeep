import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorScreen } from "@/modules/errors/error-screen";

export const metadata: Metadata = {
  title: "Page not found — Dotkeep",
};

// Shown for any address that doesn't exist, and whenever a page calls notFound() (for example a project
// that isn't yours: it looks exactly like one that doesn't exist).
export default function NotFound() {
  return (
    <ErrorScreen code="404" title="Page not found" text="The page you’re looking for doesn’t exist, or you don’t have access to it.">
      <Button nativeButton={false} render={<Link href="/dashboard" />}>Go to dashboard</Button>
      <Button variant="outline" nativeButton={false} render={<Link href="/" />}>Home</Button>
    </ErrorScreen>
  );
}
