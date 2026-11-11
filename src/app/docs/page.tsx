import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";
import { Icon, Mark } from "@/modules/landing/icons";
import "./docs.css";

export const metadata: Metadata = {
  title: "Docs — Dotkeep",
  description: "How Dotkeep works: projects and secrets, how your data is protected, sharing, settings and what is not available yet.",
};

function Callout({ tone = "info", title, children }: { tone?: "info" | "warn"; title: string; children: React.ReactNode }) {
  const CalloutIcon = tone === "warn" ? AlertTriangle : Info;
  return (
    <aside className={`docs-callout is-${tone}`}>
      <CalloutIcon aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </aside>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="docs-table-wrap">
      <table className="docs-table">
        <thead>
          <tr>{head.map((cell) => <th key={cell}>{cell}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const sections: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "overview",
    title: "What Dotkeep is",
    body: (
      <>
        <p>
          Dotkeep is a vault for the secrets your projects depend on: API keys, access tokens, webhook URLs, database URLs and
          environment variables. You keep them in one place, organised by project and environment, instead of scattering them across
          chat messages, notes and loose <code>.env</code> files.
        </p>
        <ul>
          <li>Organise secrets into <strong>projects</strong>, each with <strong>local</strong>, <strong>staging</strong> and <strong>production</strong> values.</li>
          <li>Values are encrypted before they are stored, and never shown in lists.</li>
          <li>Every view, change, import and export is written to an <strong>audit log</strong>.</li>
          <li>Share a project with teammates as an editor or a viewer.</li>
        </ul>
      </>
    ),
  },
  {
    id: "projects",
    title: "Projects and secrets",
    body: (
      <>
        <p>
          A <strong>project</strong> is a folder for one app or service. Each project holds <strong>secrets</strong>. A secret has:
        </p>
        <Table
          head={["Field", "What it is"]}
          rows={[
            ["Name", <>Something like <code>DATABASE_URL</code>, up to 80 characters.</>],
            ["Environment", "Local, Staging or Production."],
            ["Type", "API key, Access token, Webhook URL, Database URL, Environment variable or Other."],
            ["Value", "The secret itself. Encrypted, up to 10,000 characters."],
            ["Description", "Optional notes, up to 500 characters. Not encrypted, so never put a value here."],
          ]}
        />
        <p>
          The same name can exist once per environment, so <code>DATABASE_URL</code> can have a local, a staging and a production value,
          but not two production ones. In a project, the <strong>Environments</strong> view shows one row per secret name with a column for each
          environment, and marks the gaps so you can add what is missing.
        </p>
        <p>Limits: 100 projects and 1,000 secrets per account.</p>
      </>
    ),
  },
  {
    id: "encryption",
    title: "How your data is protected",
    body: (
      <>
        <Table
          head={["Protection", "How it works"]}
          rows={[
            ["Encrypted at rest", "Each value is encrypted with AES-256-GCM before it reaches the database. Only ciphertext is stored."],
            ["Unique per value", "Every value gets its own random IV, so the same secret saved twice looks different in the database."],
            ["Tamper-proof", "If anyone edits the stored ciphertext, decryption fails instead of returning wrong data."],
            ["Bound to its owner", "The encryption is tied to your account and the secret. A ciphertext copied onto another secret will not open."],
            ["Hidden by default", "Lists never contain values. A value is fetched only when you press Reveal or Copy, and it hides again after a short time."],
            ["Private to you", "Every query is filtered by owner. Someone else’s ids return “not found”."],
            ["Abuse limits", "Reveal, export and sign-in attempts are rate limited."],
          ]}
        />
        <Callout tone="warn" title="Server-side encryption is the default, end-to-end is opt-in">
          By default Dotkeep encrypts values on the server with a key the server holds, so the server can decrypt them when you reveal one.
          That protects you if the database is leaked or copied, but not if the server itself is compromised. For the strongest protection, turn on
          <strong> end-to-end encryption</strong> in Settings (see below). Two-factor authentication and “Protect secret values” add a check before values are shown.
        </Callout>
        <Callout title="Automated security tests">
          Our own test suite checks these protections against a running server. It confirms that signed-out requests are refused, that requests from
          other sites are rejected, that one user can’t reach another’s secrets, that values and password hashes never appear in responses or logs, that
          the database holds only ciphertext, that sign-in guessing is locked out, and that hostile input gets a clean error.
        </Callout>
        <Callout tone="warn" title="Not independently reviewed yet">
          Those tests are written and run by us, so they are not an independent review. Dotkeep has not had an external security review or penetration
          test, and the protections above describe how it is built, not a certified result. Think carefully before storing secrets whose loss would be
          severe. To report a vulnerability, email the address on the Privacy Policy page.
        </Callout>
        <Callout title="Keep the encryption key backed up">
          Whoever runs the Dotkeep server sets the <code>VAULT_ENCRYPTION_KEY</code>. If it is lost, every stored secret and every
          two-factor secret becomes unreadable, and nobody can recover them.
        </Callout>
      </>
    ),
  },
  {
    id: "end-to-end",
    title: "End-to-end encryption",
    body: (
      <>
        <p>
          When you turn on end-to-end encryption in Settings, your browser makes a <strong>vault key</strong> and encrypts each secret value with it before
          anything is sent. The server stores only ciphertext and a copy of the vault key that is locked by your <strong>vault passphrase</strong> and by a
          <strong> recovery key</strong>. It never receives your passphrase, your recovery key or the vault key, so it cannot read your values, even if the server
          or the database is compromised.
        </p>
        <Table
          head={["Topic", "How it works"]}
          rows={[
            ["Passphrase", "Separate from your login password, at least 12 characters. It is asked for once per page load, to unlock the vault in that tab. It never leaves your browser."],
            ["Recovery key", "Shown once when you turn it on. If you forget the passphrase, the recovery key lets you choose a new one. Keep it somewhere safe, away from this browser."],
            ["Existing secrets", "“Encrypt existing secrets” in Settings moves secrets you saved before, version history included, to end-to-end encryption."],
            ["Reveal, copy, history, export", "Work as before. The server hands over ciphertext and your browser opens it. Exports and backups include end-to-end secrets in plain text, like any export."],
          ]}
        />
        <h3>What it does not cover</h3>
        <ul>
          <li><strong>Lose both, lose the data.</strong> If you lose the passphrase and the recovery key, nobody, including us, can recover your secrets.</li>
          <li><strong>Shared projects keep server-side encryption.</strong> A teammate has no key to your vault, so a project with end-to-end secrets can’t be shared yet, and an end-to-end secret can’t be moved into a shared project.</li>
          <li><strong>Importing a .env file and restoring a backup are not available</strong> while it is on, because they would show the server the values. Export still works.</li>
          <li><strong>Names, environments, types and notes are not encrypted.</strong> Only values are. The activity log records that a secret was viewed, never its value.</li>
          <li><strong>The web app has to trust the page it loads.</strong> Your browser runs the encryption code that Dotkeep’s server sends, so a compromised server could send altered code. A command-line tool or browser extension would close that gap, and neither exists yet.</li>
          <li><strong>It can’t be turned off yet.</strong></li>
          <li>Your passphrase protects your keys against someone who copies them, so choose a long one. Short ones can be guessed offline.</li>
        </ul>
        <Callout tone="warn" title="Not independently reviewed">
          The encryption is built on the browser’s standard cryptography (AES-256-GCM, PBKDF2-SHA256), but this design has not been reviewed by an outside security expert.
        </Callout>
      </>
    ),
  },
  {
    id: "using-secrets",
    title: "Working with secrets",
    body: (
      <Table
        head={["Action", "What happens"]}
        rows={[
          [<strong key="a">Reveal</strong>, "Shows the value for the time set in Settings (15 seconds by default), then hides it again. Logged as “Viewed”."],
          [<strong key="b">Copy</strong>, "Copies the value to the clipboard without having to show it on screen."],
          [<strong key="c">Edit</strong>, "Change the name, environment or type. Leave the value empty to keep the current one. You can also move a secret to another project you own."],
          [<strong key="d">Bulk edit</strong>, "Tick several rows to move them, change environment or type, or delete them together, up to 200 at a time."],
          [<strong key="e">Version history</strong>, "When a value changes, the old one is kept encrypted (last 20). You can reveal, copy or restore any earlier version."],
          [<strong key="f">Delete</strong>, "Asks for confirmation. Deleting a project also deletes every secret inside it."],
        ]}
      />
    ),
  },
  {
    id: "import-export",
    title: "Import, export and backup",
    body: (
      <>
        <h3>One environment at a time</h3>
        <p>
          Use the import / export menu on the Vault page. Both <strong>.env</strong> and <strong>JSON</strong> (<code>{"{ \"NAME\": \"value\" }"}</code>)
          are supported. Pick a project and environment, then paste text or choose a file. “Replace” overwrites existing values and keeps the old
          ones in history. Lines that can’t be read are reported rather than silently skipped.
        </p>
        <h3>Whole-vault backup</h3>
        <p>
          <strong>Back up whole vault</strong> downloads all of your own projects and secrets as one JSON file, and <strong>Restore backup</strong> loads
          it again. Projects are matched by name and created if missing. Secrets that already exist are skipped, unless you choose to overwrite.
          Projects shared with you are not included, because they belong to someone else.
        </p>
        <Callout tone="warn" title="Exports contain real values">
          Exported and backup files hold your secrets in plain text, not encrypted. Store them safely and never commit them to git. Every export is
          recorded in the activity log.
        </Callout>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Sharing projects",
    body: (
      <>
        <p>
          Each project has one <strong>owner</strong>, who can invite other verified Dotkeep users by email and give them a role.
        </p>
        <Table
          head={["Role", "Can do"]}
          rows={[
            [<strong key="o">Owner</strong>, "Everything: share, rename and delete the project, manage members."],
            [<strong key="e">Editor</strong>, "Add, edit, move and delete secrets, import .env files and restore versions."],
            [<strong key="v">Viewer</strong>, "Read only: reveal, copy, export, and read history and activity."],
          ]}
        />
        <ul>
          <li>Secrets always belong to the project owner, so sharing never copies or re-encrypts them.</li>
          <li>A member can leave a project at any time. If the owner removes someone, their access stops immediately. Values they already saw could have been copied.</li>
          <li>The activity log records who did what in a shared project.</li>
        </ul>
      </>
    ),
  },
  {
    id: "activity",
    title: "Activity log",
    body: (
      <p>
        The <strong>Activity</strong> page is an audit log of your secrets: created, viewed, edited, value changed, moved, restored, imported,
        exported and deleted. It records what happened and when, never the value itself, and it stays even after a secret is deleted. The latest 200
        events are shown, and each secret also has its own history.
      </p>
    ),
  },
  {
    id: "settings",
    title: "Settings",
    body: (
      <>
        <p>Settings controls your account and how the vault behaves for you.</p>
        <Table
          head={["Section", "What you can do"]}
          rows={[
            [<strong key="p">Profile</strong>, "Change your display name. Your email is shown but can’t be changed."],
            [<strong key="pw">Password</strong>, "Enter your current password and choose a new one (8 to 128 characters). Every other device is signed out, and you get an alert email about the change."],
            [<strong key="v">Vault</strong>, "Choose how long a revealed secret stays visible: 5, 15 (default), 30 or 60 seconds. It saves as soon as you pick."],
            [<strong key="s">Where you’re signed in</strong>, "See your active sessions, sign out a single device, or choose “Sign out everywhere else”."],
            [<strong key="t">Two-factor authentication</strong>, "Add a second step to sign-in. See below."],
            [<strong key="e2ee">End-to-end encryption</strong>, "Encrypt values in your browser with a passphrase only you know. See “End-to-end encryption” above."],
            [<strong key="l">Protect secret values</strong>, "Ask for a code before values are shown. See below."],
            [<strong key="d">Delete account</strong>, "Permanently deletes your account, projects, secrets and history. Needs your password and can’t be undone."],
          ]}
        />
        <h3>Where you’re signed in</h3>
        <p>
          Each session shows a short label such as “Chrome on Windows” and when it started. Dotkeep does not store your IP address or the full browser string.
          Sessions expire on their own after 7 days.
        </p>
        <h3>Two-factor authentication</h3>
        <ol>
          <li>Enter your password, then scan the QR code with an authenticator app such as Google Authenticator, Authy or 1Password.</li>
          <li>Type the 6-digit code to switch it on.</li>
          <li>Save the <strong>8 recovery codes</strong> shown. They appear only once, and each works a single time if you lose your phone.</li>
        </ol>
        <p>
          After that, signing in needs your password (or Google) and then a code from the app or a recovery code. Five wrong codes in a row cancel the
          attempt and you start again. A code can’t be reused. Turning 2FA off or generating new recovery codes needs your password and a current code,
          so a stolen session can’t remove it.
        </p>
        <h3>Protect secret values</h3>
        <p>
          Available once 2FA is on, and off by default. When enabled, Reveal, Copy and Export ask for a code first. After one correct code you aren’t
          asked again for 10 minutes. The server enforces it, not just the screen. This is useful on a shared computer where a browser might be left signed in.
          Turning it off needs your password and a code, and turning 2FA off turns it off too.
        </p>
        <h3>Deleting your account</h3>
        <p>
          Your sessions, secrets, version history, projects and activity are removed, and your account last. If you are the only admin, make someone else
          an admin first. You can sign up again later with the same email, but nothing comes back.
        </p>
      </>
    ),
  },
  {
    id: "roadmap",
    title: "Not available yet",
    body: (
      <>
        <p>These are things Dotkeep doesn’t do today. They’re ideas we’re considering, not promises or dates.</p>
        <ul>
          <li><strong>Changing your email.</strong> Your email is fixed for now.</li>
          <li><strong>Dark mode.</strong> There is only a light theme.</li>
          <li><strong>Custom tags</strong> for organising secrets beyond projects, environments and types.</li>
          <li><strong>Terminal (CLI) access.</strong> Pull and push secrets from the command line, for example to load a project’s environment into your shell or CI. For now, use the web app with .env import and export.</li>
          <li><strong>Teams and organisations.</strong> Sharing works per project today, with an owner, editors and viewers.</li>
        </ul>
      </>
    ),
  },
  {
    id: "faq",
    title: "Good to know",
    body: (
      <ul>
        <li><strong>Lost your phone?</strong> Sign in with a recovery code, then set up 2FA again.</li>
        <li><strong>Forgot your password?</strong> Use “Forgot password” on the sign-in page. A reset email is sent, and you’re alerted when the password changes.</li>
        <li><strong>Used a secret by mistake in a description?</strong> Descriptions aren’t encrypted. Edit the secret to remove it.</li>
        <li><strong>Moving to another machine?</strong> Use the whole-vault backup, and restore it there.</li>
      </ul>
    ),
  },
];

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

export default function DocsPage() {
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
          <p className="dash-kicker">DOCS</p>
          <h1>How Dotkeep works</h1>
          <p className="dash-lead">Everything about projects, secrets, sharing, settings and how your data is kept safe.</p>
        </header>
        <div className="docs-layout">
          <nav className="docs-toc" aria-label="On this page">
            <p className="dash-nav-caption">ON THIS PAGE</p>
            {sections.map(({ id, title }) => (
              <a key={id} href={`#${id}`}>{title}</a>
            ))}
          </nav>
          <div className="docs-body">
            {sections.map(({ id, title, body }) => (
              <section key={id} id={id} className="dash-panel docs-section">
                <h2>{title}</h2>
                {body}
              </section>
            ))}
          </div>
        </div>
      </main>
      <footer className="docs-foot section-shell">© 2026 Dotkeep <span>·</span> <Link href="/privacy">Privacy Policy</Link> <span>·</span> <Link href="/terms">Terms of Service</Link></footer>
    </>
  );
}
