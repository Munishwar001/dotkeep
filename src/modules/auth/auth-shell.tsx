import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Mark } from "@/modules/landing/icons";

type Mode = "login" | "signup" | "verify";

const copy = {
  login: {
    title: "Welcome back",
    text: "Sign in to your Dotkeep workspace.",
    switchText: "New to Dotkeep?",
    switchLabel: "Create an account",
    switchHref: "/signup",
  },
  verify: {
    title: "Verify your email",
    text: "One last step to finish setting up your account.",
    switchText: "Already verified?",
    switchLabel: "Sign in",
    switchHref: "/login",
  },
  signup: {
    title: "Create your workspace",
    text: "Start organizing the secrets behind your projects.",
    switchText: "Already have an account?",
    switchLabel: "Sign in",
    switchHref: "/login",
  },
} as const;

const rows = [
  { name: "Discord notifications", meta: "Webhook URL · launchpad" },
  { name: "Supabase · production", meta: "Database · launchpad" },
  { name: "GitHub personal token", meta: "Access token · dotkeep-web" },
];

export function AuthShell({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  const c = copy[mode];
  return (
    <div className="auth">
      <div className="auth-main">
        <header className="auth-top">
          <Link className="wordmark" href="/" aria-label="Dotkeep home"><Mark /><span>dotkeep</span></Link>
          <Link className="auth-back" href="/"><ArrowLeft aria-hidden="true" /> Back to home</Link>
        </header>

        <main className="auth-card">
          <h1>{c.title}</h1>
          <p className="auth-lead">{c.text}</p>
          {children}
          <p className="auth-switch">{c.switchText} <Link href={c.switchHref}>{c.switchLabel}</Link></p>
        </main>

        <footer className="auth-foot">© 2026 Dotkeep <span>·</span> Early days. A thoughtful foundation.</footer>
      </div>

      <aside className="auth-panel" aria-hidden="true">
        <div className="auth-panel-rings" />
        <div className="auth-panel-inner">
          <div className="section-kicker section-kicker-light"><span /> THOUGHTFUL BY DEFAULT</div>
          <h2>Everything your projects need.<br /><em>Nothing they should expose.</em></h2>

          <div className="auth-vault">
            <div className="auth-vault-head"><span>YOUR VAULT</span><span className="auth-vault-badge"><i /> Values hidden by default</span></div>
            {rows.map((row, i) => (
              <div className="auth-vault-row" key={row.name} style={{ "--i": i } as React.CSSProperties}>
                <span className="auth-vault-icon" />
                <span><b>{row.name}</b><small>{row.meta}</small></span>
                <span className="auth-vault-mask">••••••••••••</span>
              </div>
            ))}
          </div>

          <ul className="auth-principles">
            <li><span>01</span> Mask sensitive values by default.</li>
            <li><span>02</span> Keep access scoped to the right people.</li>
            <li><span>03</span> Keep sensitive values out of source control.</li>
          </ul>
          <small className="auth-panel-note">These are design principles, not a claim of completed security certification or implementation.</small>
        </div>
      </aside>
    </div>
  );
}
