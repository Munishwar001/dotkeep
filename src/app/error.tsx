"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorScreen } from "@/modules/errors/error-screen";

// Shown when something throws while a page is rendering. The error itself is recorded on the server
// (src/instrumentation.ts); the visitor only sees a generic message and an id to quote.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorScreen code="500" title="Something went wrong" text="We hit an unexpected problem. It has been recorded. Try again, and if it keeps happening, quote the error ID below." digest={error.digest}>
      <Button onClick={() => retry()}>Try again</Button>
      <Button variant="outline" nativeButton={false} render={<Link href="/dashboard" />}>Go to dashboard</Button>
    </ErrorScreen>
  );
}
