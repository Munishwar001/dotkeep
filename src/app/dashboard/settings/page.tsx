import type { Metadata } from "next";
import { cookies } from "next/headers";
import { listSessions } from "@/db/sessions";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { requireUser } from "@/modules/dashboard/data";
import { DashboardFrame } from "@/modules/dashboard/frame";
import { Topbar } from "@/modules/dashboard/overview";
import { PageHeader } from "@/modules/dashboard/page-header";
import { DeleteAccount } from "@/modules/settings/delete-account";
import { PasswordForm } from "@/modules/settings/password-form";
import { PreferencesForm } from "@/modules/settings/preferences-form";
import { ProfileForm } from "@/modules/settings/profile-form";
import { SessionsList } from "@/modules/settings/sessions-list";

export const metadata: Metadata = {
  title: "Settings — Dotkeep",
  robots: { index: false },
};

const reveal = (i: number) => ({ "--i": i }) as React.CSSProperties;

// Each section is two columns on a wide screen: what it is on the left, the form on the right.
function Section({ id, title, text, index, danger, wide, children }: { id: string; title: string; text: string; index: number; danger?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={`dash-panel dash-reveal st-section${danger ? " is-danger" : ""}`} style={reveal(index)} aria-labelledby={id}>
      <div className="st-section-info">
        <h2 id={id}>{title}</h2>
        <p className="st-section-text">{text}</p>
      </div>
      <div className={`st-section-body${wide ? " is-wide" : ""}`}>{children}</div>
    </section>
  );
}

// Reads the session cookie (request-time data), so it runs inside the Suspense boundary from DashboardFrame.
async function SettingsContent() {
  const { user, userId } = await requireUser();
  const sessions = await listSessions(userId, (await cookies()).get(SESSION_COOKIE)?.value);

  return (
    <>
      <Topbar user={user} title="Settings" />
      <main className="dash-content">
        <PageHeader kicker="SETTINGS" title="Your account" text="Manage your profile, password, and where you’re signed in." />
        <div className="st-stack">
          <Section id="profile" index={0} title="Profile" text="How you appear in Dotkeep.">
            <ProfileForm name={user.name} email={user.email} />
          </Section>
          <Section id="password" index={1} title="Password" text="Use a long, unique password.">
            <PasswordForm />
          </Section>
          <Section id="vault" index={2} title="Vault" text="How the vault behaves for you.">
            <PreferencesForm revealSeconds={user.revealSeconds} />
          </Section>
          <Section id="sessions" index={3} wide title="Where you’re signed in" text="Sign out any device you don’t recognize. Sessions last 7 days.">
            <SessionsList sessions={sessions} />
          </Section>
          <Section id="danger" index={4} danger title="Delete account" text="Permanently deletes your account, projects, secrets and sessions. This can’t be undone.">
            <DeleteAccount />
          </Section>
        </div>
      </main>
    </>
  );
}

export default function SettingsPage() {
  return (
    <DashboardFrame active="settings">
      <SettingsContent />
    </DashboardFrame>
  );
}
