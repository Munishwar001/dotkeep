import Link from "next/link";
import { Boxes, Check, FolderKanban, KeyRound, type LucideIcon } from "lucide-react";
import type { PublicUser } from "@/db/users";
import { formatDate } from "@/modules/vault/format";
import { Mark } from "@/modules/landing/icons";
import { UserMenu } from "./user-menu";

export type Counts = { secrets: number; projects: number; environments: number };

const reveal = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function Topbar({ user, title }: { user: PublicUser; title: string }) {
  return (
    <header className="dash-top">
      <Link className="wordmark dash-top-logo" href="/" aria-label="Dotkeep home"><Mark /><span>dotkeep</span></Link>
      <span className="dash-crumb">{title}</span>
      <UserMenu name={user.name} email={user.email} role={user.role} />
    </header>
  );
}

export function Overview({ user, counts }: { user: PublicUser; counts: Counts }) {
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;

  const stats: { label: string; icon: LucideIcon; value: number; href: string }[] = [
    { label: "Secrets", icon: KeyRound, value: counts.secrets, href: "/dashboard/vault" },
    { label: "Projects", icon: FolderKanban, value: counts.projects, href: "/dashboard/projects" },
    { label: "Environments", icon: Boxes, value: counts.environments, href: "/dashboard/vault" },
  ];

  // Each step ticks itself off based on what you've actually created.
  const steps = [
    { title: "Create a project", text: "Group the secrets for one app or service together.", done: counts.projects > 0, href: "/dashboard/projects" },
    { title: "Add your first secret", text: "Save an API key, token, webhook, or database URL.", done: counts.secrets > 0, href: "/dashboard/vault" },
    { title: "Organize by environment", text: "Keep local, staging, and production values apart.", done: counts.environments > 1, href: "/dashboard/vault" },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <main className="dash-content">
      <header className="dash-head dash-reveal" style={reveal(0)}>
        <p className="dash-kicker">OVERVIEW</p>
        <h1>Welcome, {firstName}.</h1>
        <p className="dash-lead">
          {counts.secrets > 0
            ? "Here’s what’s in your vault right now."
            : "This is where your secrets and projects will live. Start with a project, then add your first secret."}
        </p>
      </header>

      <section className="dash-stats" aria-label="Summary">
        {stats.map(({ label, icon: StatIcon, value, href }, i) => (
          <Link className="dash-tile dash-reveal" style={reveal(i + 1)} key={label} href={href}>
            <span className="dash-tile-icon"><StatIcon aria-hidden="true" /></span>
            <p className="dash-tile-label">{label}</p>
            <p className="dash-tile-value">{value}</p>
            <p className="dash-tile-hint">{value === 0 ? "Nothing here yet" : "View"}</p>
          </Link>
        ))}
      </section>

      <div className="dash-grid">
        <section className="dash-panel dash-reveal" style={reveal(4)} aria-labelledby="get-started">
          <div className="dash-panel-head">
            <h2 id="get-started">Get started</h2>
            <span className="dash-badge">{doneCount} of {steps.length} done</span>
          </div>
          <ol className="dash-steps">
            {steps.map((step, i) => (
              <li key={step.title} className={step.done ? "is-done" : undefined}>
                <span className="dash-step-num">{step.done ? <Check aria-label="Done" /> : i + 1}</span>
                <span>
                  <b>{step.done ? step.title : <Link href={step.href}>{step.title}</Link>}</b>
                  <small>{step.text}</small>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="dash-panel dash-reveal" style={reveal(5)} aria-labelledby="account">
          <div className="dash-panel-head"><h2 id="account">Account</h2></div>
          <dl className="dash-facts">
            <div><dt>Name</dt><dd>{user.name}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Member since</dt><dd>{formatDate(user.createdAt.toISOString())}</dd></div>
          </dl>
        </section>
      </div>
    </main>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your dashboard">
      <header className="dash-top"><span className="dash-skel" style={{ width: 90, height: 14 }} /><span className="dash-skel" style={{ width: 120, height: 32, borderRadius: 999 }} /></header>
      <main className="dash-content">
        <span className="dash-skel" style={{ width: 280, height: 34 }} />
        <div className="dash-stats" style={{ marginTop: 28 }}>
          {[0, 1, 2].map((i) => <span key={i} className="dash-skel" style={{ height: 132, borderRadius: 14 }} />)}
        </div>
      </main>
    </div>
  );
}
