import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage, type LegalSection } from "@/modules/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — Dotkeep",
  description: "The rules for using Dotkeep: your account, your secrets, acceptable use and the limits of the service.",
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement",
    body: (
      <p>
        By creating an account or using Dotkeep you agree to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If you do not agree,
        please do not use the service. If you use Dotkeep for an organisation, you confirm you may accept these Terms on its behalf.
      </p>
    ),
  },
  {
    id: "service",
    title: "The service",
    body: (
      <>
        <p>
          Dotkeep is a vault for storing and organising secrets such as API keys, tokens and environment variables, and for sharing them with
          teammates. Dotkeep is early software. Features may change, and some things are not built yet (see <Link href="/docs#roadmap">what is not available</Link>).
        </p>
        <p>
          Values are encrypted on the server with a key the server holds. This protects you if the database is copied, but it is not end-to-end
          encryption. Please read <Link href="/docs#encryption">how your data is protected</Link> and decide whether it fits what you store.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul>
        <li>You must be at least 16 and give accurate information, including a working email address.</li>
        <li>Keep your password, recovery codes and signed-in devices secure. You are responsible for activity under your account.</li>
        <li>Tell us promptly if you think your account has been compromised.</li>
        <li>You can delete your account at any time in Settings.</li>
      </ul>
    ),
  },
  {
    id: "content",
    title: "Your secrets",
    body: (
      <>
        <p>
          You own what you store. We claim no rights over it. You give us only the permission needed to store, encrypt, process and show it to you and
          the people you share it with, so that the service works.
        </p>
        <p>
          You are responsible for having the right to store what you put in Dotkeep, and for who you share it with. A member you remove may still have
          copied values they saw before. If a secret may have been exposed, rotate it at its source.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>Please do not:</p>
        <ul>
          <li>use Dotkeep to store or share anything unlawful, or credentials you have no right to hold;</li>
          <li>try to access another user’s data, or probe, scan or test the service’s security without our written permission;</li>
          <li>get around rate limits or other protections, or disrupt or overload the service;</li>
          <li>reverse engineer the service, or use it to build a competing product from our systems;</li>
          <li>use automated means to create accounts or to send spam.</li>
        </ul>
        <p>We may suspend or remove accounts that break these rules, after warning you where it is reasonable to do so.</p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Availability and backups",
    body: (
      <>
        <p>
          We aim to keep Dotkeep running but do not promise it will always be available or error free. We may change, pause or stop features, and
          will try to give notice for changes that affect you.
        </p>
        <p>
          Keep your own backup. Use the whole-vault backup in Dotkeep and store the file safely, because it holds values in plain text. Do not make
          Dotkeep the only place a critical secret lives.
        </p>
      </>
    ),
  },
  {
    id: "disclaimer",
    title: "No warranty",
    body: (
      <p>
        Dotkeep is provided “as is” and “as available”, without warranties of any kind, to the extent the law allows. We do not warrant that it will be
        uninterrupted, error free or free from security vulnerabilities.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limit of liability",
    body: (
      <p>
        To the extent the law allows, Dotkeep and the people behind it are not liable for indirect or consequential loss, or for loss of data, profits
        or business, arising from your use of the service. Our total liability for any claim is limited to the amount you paid us in the 12 months
        before it arose, which for a free account is zero. Nothing here limits liability that cannot lawfully be limited.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Ending your use",
    body: (
      <p>
        You can stop using Dotkeep and delete your account whenever you like. We may suspend or end your access if you break these Terms or put the
        service or other users at risk. When an account is deleted, its data is removed as described in the Privacy Policy.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: (
      <p>
        We may update these Terms. If a change is meaningful, we will update the date at the top and tell you by email or in the app before it takes
        effect. Using Dotkeep after that means you accept the new Terms.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: <p>Questions about these Terms? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      kicker="TERMS"
      title="Terms of Service"
      lead="The ground rules for using Dotkeep: what you can expect from us, and what we ask of you."
      sections={sections}
    />
  );
}
