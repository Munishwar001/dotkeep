import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage, type LegalSection } from "@/modules/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Dotkeep",
  description: "What Dotkeep collects, how your secrets and account data are protected, who we share it with, and the choices you have.",
};

const sections: LegalSection[] = [
  {
    id: "summary",
    title: "The short version",
    body: (
      <ul>
        <li>We collect only what is needed to run your account and your vault: your email, name, password (or Google sign-in) and the secrets you save.</li>
        <li>Secret values are encrypted before they are stored. We never sell your data and never use it for advertising.</li>
        <li>By default Dotkeep encrypts on the server. You can turn on end-to-end encryption so values encrypted by your browser cannot be read from the stored ciphertext alone. Previously saved secrets remain server-encrypted until you run “Encrypt existing secrets,” including their history. Secrets in shared projects remain server-encrypted. <Link href="/docs#end-to-end">The docs</Link> explain both, and their limits.</li>
        <li>You can export your data and delete your account at any time, from Settings.</li>
      </ul>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <h3>Account information</h3>
        <p>
          Your email address and display name. If you sign up with a password, we store a salted hash of it (scrypt), never the password itself.
          If you sign in with Google, we receive your Google email address and name, and nothing else from your Google account.
        </p>
        <h3>Vault content</h3>
        <p>
          The projects and secrets you create. Secret values are stored encrypted with AES-256-GCM. Names, environments, types and descriptions
          are stored as plain text so they can be listed and searched, which is why descriptions should never contain a secret.
          The last 20 previous values of each secret are kept encrypted so you can restore them.
          If you turn on end-to-end encryption, values are encrypted in your browser before they are sent, and we store only the ciphertext and a copy of your
          vault key that is locked by your passphrase and recovery key. We never receive the passphrase or the recovery key.
        </p>
        <h3>Activity and security records</h3>
        <p>
          An audit log of what happened to your secrets (created, viewed, edited, exported, deleted) and when. It never contains the values.
          For two-factor authentication we store an encrypted authenticator secret and hashed recovery codes.
        </p>
        <h3>Sessions</h3>
        <p>
          When you sign in we create a session and store a short device label such as “Chrome on Windows”, plus when it started. We do not store your
          IP address or your full browser string. Sessions expire after 7 days.
        </p>
        <h3>Cookies</h3>
        <p>
          Dotkeep sets one essential cookie that keeps you signed in. It is HTTP-only, so page scripts cannot read it. We do not use advertising
          or tracking cookies.
        </p>
        <h3>Analytics</h3>
        <p>
          On our public pages (the home page, docs, sign-in and sign-up) we use Vercel Web Analytics to count page views and see where visitors come
          from. It sets no cookie and does not follow you across other sites. We send only the page address, with anything after the page path removed.
          It does not run inside your dashboard, and it is never sent your secrets, your account details or the links in your emails.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <ul>
        <li>To provide the vault: storing, showing and sharing your secrets as you ask.</li>
        <li>To sign you in and keep your account secure, including rate limiting sign-in, reveal and export attempts.</li>
        <li>To send emails you need: verification, password reset and alerts when your password changes. We do not send marketing email.</li>
        <li>To keep the audit log that you see on the Activity page.</li>
      </ul>
    ),
  },
  {
    id: "google",
    title: "Sign in with Google",
    body: (
      <>
        <p>
          If you choose “Continue with Google”, Dotkeep asks for the <code>openid</code>, <code>email</code> and <code>profile</code> scopes. We use your
          email address to find or create your account and your name to fill in your display name. We do not read your Gmail, Drive, contacts, calendar
          or any other Google data, and we do not share Google user data with anyone.
        </p>
        <p>
          Dotkeep’s use of information received from Google follows the <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer noopener" target="_blank">Google API Services User Data Policy</a>,
          including its Limited Use requirements. You can revoke Dotkeep’s access at any time from your <a href="https://myaccount.google.com/permissions" rel="noreferrer noopener" target="_blank">Google Account permissions</a> page.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <p>We do not sell or rent your information. It is shared only in these cases:</p>
        <ul>
          <li><strong>People you choose.</strong> When you share a project, its members can see that project’s secrets according to their role, and the activity in it.</li>
          <li><strong>Service providers.</strong> Our hosting and analytics provider (Vercel), our database host and our email provider process data on our behalf, only to run Dotkeep.</li>
          <li><strong>Legal requirements.</strong> If we are legally required to disclose information, we will do so only to the extent needed. Because values are encrypted, we hold them only in encrypted form.</li>
        </ul>
      </>
    ),
  },
  {
    id: "retention",
    title: "Keeping and deleting data",
    body: (
      <>
        <p>
          We keep your data while your account exists. When you delete your account in Settings, your sessions, secrets, version history, projects and
          activity are removed, and your account last. This cannot be undone. Backups made by our infrastructure provider may hold the data for a short
          time before they expire.
        </p>
        <p>Files you export from Dotkeep, including whole-vault backups, contain your secrets in plain text. Once downloaded, they are yours to protect.</p>
      </>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <>
        <p>
          Values are encrypted at rest, hidden by default and fetched only when you reveal or copy them. Access is scoped to the owner and to the
          members they invite. You can add two-factor authentication and require a code before values are shown. No system is perfectly secure,
          and we cannot guarantee absolute security, but we take care to reduce risk.
        </p>
        <p>
          We run automated security tests ourselves, covering access control, cross-site request protection, sign-in limits and leaks of secret values.
          Dotkeep has not yet had an independent security review or penetration test, and we make no claim of security certification. Please weigh that
          when deciding what to store. If you find a vulnerability, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will respond and fix it.
        </p>
        <p>If we learn of a breach affecting your data, we will tell you without undue delay.</p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your choices",
    body: (
      <>
        <ul>
          <li><strong>Access and export.</strong> Download your vault from the Vault page at any time.</li>
          <li><strong>Correction.</strong> Change your display name in Settings.</li>
          <li><strong>Deletion.</strong> Delete your account in Settings.</li>
        </ul>
        <p>
          Depending on where you live, you may have further rights over your personal data, such as objecting to processing or complaining to a
          data protection authority. To use any of them, write to us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>Dotkeep is built for developers and is not intended for anyone under 16. We do not knowingly collect information from children.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        If we change this policy in a meaningful way, we will update the date at the top and, where the change matters to you, tell you by email
        or in the app before it takes effect.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: <p>Questions about privacy? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      kicker="PRIVACY"
      title="Privacy Policy"
      lead="What Dotkeep collects, why, and the choices you have. Written plainly, because a vault should earn your trust."
      sections={sections}
    />
  );
}
