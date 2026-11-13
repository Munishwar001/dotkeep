import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";
import { Icon, Mark } from "@/modules/landing/icons";
import "@/app/docs/docs.css";

/** Where privacy and legal questions go. Change it here and both pages follow. */
export const CONTACT_EMAIL = "legal@dotkeep.com";

export const LAST_UPDATED = "13 November 2026";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

/** Signed-in visitors get a link back to the app. It reads the session cookie, so it streams in inside Suspense. */
async function HeaderActions() {
  const user = await getCurrentUser();
  if (user) {
    return <Button nativeButton={false} size="sm" className="h-9 gap-2 px-3.5 text-xs" render={<Link href="/dashboard" />}>Dashboard <Icon name="arrow" /></Button>;
  }
  return (
    <>
      <Link className="sign-in" href="/login">Sign in</Link>
      <Button nativeButton={false} size="sm" className="h-9 gap-2 px-3.5 text-xs" render={<Link href="/signup" />}>Get started <Icon name="arrow" /></Button>
    </>
  );
}

export function LegalPage({ kicker, title, lead, sections }: { kicker: string; title: string; lead: string; sections: LegalSection[] }) {
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link className="wordmark" href="/" aria-label="Dotkeep home"><Mark /><span>dotkeep</span></Link>
          <div className="header-actions">
            <Suspense fallback={null}>
              <HeaderActions />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="docs-page section-shell">
        <header className="docs-hero">
          <p className="dash-kicker">{kicker}</p>
          <h1>{title}</h1>
          <p className="dash-lead">{lead}</p>
          <p className="legal-updated">Last updated {LAST_UPDATED}</p>
        </header>
        <div className="docs-layout">
          <nav className="docs-toc" aria-label="On this page">
            <p className="dash-nav-caption">ON THIS PAGE</p>
            {sections.map(({ id, title: sectionTitle }) => (
              <a key={id} href={`#${id}`}>{sectionTitle}</a>
            ))}
            <p className="dash-nav-caption legal-toc-gap">RELATED</p>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/docs">Docs</Link>
          </nav>
          <div className="docs-body">
            {sections.map(({ id, title: sectionTitle, body }) => (
              <section key={id} id={id} className="dash-panel docs-section">
                <h2>{sectionTitle}</h2>
                {body}
              </section>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
