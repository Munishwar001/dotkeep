<div align="center">

<h1>
  <img src="docs/logo.svg" alt="" width="44" height="44" align="center">
  Dotkeep
</h1>

**The secrets vault for your projects.**

Keep API keys, tokens, webhook URLs and `.env` values in one encrypted place, organised by project and environment,<br>
with an audit trail and per-project sharing. Optional end-to-end encryption means not even the server can read your values.

[![CI](https://github.com/Munishwar001/dotkeep/actions/workflows/ci.yml/badge.svg)](https://github.com/Munishwar001/dotkeep/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![MongoDB](https://img.shields.io/badge/MongoDB-7-47a248)
![Status](https://img.shields.io/badge/status-beta-orange)

</div>

> **Status: beta.** Dotkeep is a working product, but it has not had an independent security review yet. Until it has, keep high-value production secrets elsewhere. See [Security](#security) for exactly what is and isn't protected.

---

## Demo

<div align="center">
  <video src="https://github.com/user-attachments/assets/5db66581-df0d-4eb1-ab9c-a860a5d66bbc" controls muted playsinline width="640">
    <a href="https://github.com/user-attachments/assets/5db66581-df0d-4eb1-ab9c-a860a5d66bbc">Watch the product video</a>
  </video>
</div>

## What it is

Secrets end up in chat messages, notes and loose `.env` files. Dotkeep gives them one home, so you always know where a value is, who touched it, and who can see it.

| You want to… | Dotkeep gives you… |
|---|---|
| Stop pasting keys into chat | One vault per project, with local, staging and production side by side |
| Know who saw or changed a secret | An audit log of every view, change, move, import and export (it never records values) |
| Share a project safely | Owner, editor and viewer roles, per project, revocable instantly |
| Limit the damage of a leak | Encryption at rest, two-factor sign-in, and a code requirement before Reveal, Copy or Export |
| Keep even the host out | Opt-in end-to-end encryption with a passphrase and a recovery key |

The public docs are at **/docs** and need no sign-in.

## Features

**Vault**
- Projects with **local**, **staging** and **production** environments, and typed secrets (API key, access token, webhook URL, database URL, environment variable).
- Values are **encrypted before they are stored** and never appear in lists. A value is fetched only on Reveal or Copy, and auto-hides again (5, 15, 30 or 60 seconds, your choice).
- **Version history:** the last 20 values of each secret are kept, and you can reveal or restore any of them.
- **Environments view:** one row per secret name with a column per environment, with gaps marked.
- **Bulk edit:** move, retype or delete up to 200 secrets at once.

**Import, export and backup**
- Import and export a single environment as `.env` or JSON.
- One-click **whole-vault backup and restore** (not available on end-to-end accounts, see below).

**Sharing**
- Share a project by email as **owner**, **editor** or **viewer**. Access changes take effect immediately.
- The **audit log** records who viewed, changed, moved, imported or exported what, and when.

**Account security**
- Email and password sign-in with email verification, or Google sign-in.
- **Two-factor authentication** (authenticator app) with one-time recovery codes.
- **Protect secret values:** require a 2FA code before Reveal, Copy or Export.
- Session list with per-device sign-out, and password-change alerts by email.
- **Opt-in end-to-end encryption** (Settings), with a passphrase and a recovery key.
- Admin area for user management and a server error record.

## Security

Dotkeep stores secrets in one of two ways. You choose per account.

### Default: encrypted on the server

| Measure | Detail |
|---|---|
| Encryption at rest | AES-256-GCM with a random IV per value |
| Tamper detection | Modified ciphertext fails to decrypt instead of returning wrong data |
| Context binding | Ciphertext is bound to its owner and secret, so it can't be copied onto another one |
| No leaks in lists | Secret values are never part of list responses or page HTML |
| Tenant isolation | Every query is filtered by owner. Someone else's ids return `404` |
| Abuse limits | Rate limits on sign-in, reveal, export and 2FA attempts |
| CSRF | Same-origin checks on state-changing requests, JSON only |
| Server-side validation | All input and limits are enforced on the server |
| Headers | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` |

The server holds the key, so it **can** decrypt a value when you reveal it. This protects you if the database leaks. It does not protect you if the server itself is compromised.

### Opt-in: end-to-end encrypted

Turn it on in **Settings**. Your browser encrypts each value with a vault key before sending it. The vault key is stored only in locked form: once locked by your **passphrase** (PBKDF2-SHA256, 600,000 iterations) and once by a **recovery key**. The server stores ciphertext and never receives the passphrase, the recovery key or the vault key.

Limits you should know before using it:

- **Lose both the passphrase and the recovery key and the secrets are gone.** Nobody can recover them, including us.
- Shared projects stay server-side encrypted (members don't have your vault key).
- Import and whole-vault backup restore are off for end-to-end accounts.
- Names, environments, types and notes are not encrypted.
- The vault locks on page reload and asks for the passphrase again.
- A web app's JavaScript comes from the server, so a fully compromised server could serve altered code. A CLI or browser extension would close that gap.
- A weak passphrase can be guessed offline by someone who copies the locked key.

### Reviews and reporting

- Internally reviewed and covered by an automated security regression suite. **Not independently audited.**
- Found a vulnerability? Please report it privately, not in a public issue. Use **Security → Report a vulnerability** on this repository (the repo owner needs to have private reporting switched on in the repository settings).

## Architecture

```
Browser ──HTTPS──▶ Next.js (App Router, Vercel) ──▶ MongoDB Atlas
   │                     │
   │                     ├─ session cookie + CSRF checks on every write
   │                     ├─ AES-256-GCM (VAULT_ENCRYPTION_KEY) for server-side values
   │                     └─ SMTP for verification, reset and alert emails
   └─ end-to-end mode: WebCrypto encrypts/decrypts in the browser; the server only sees ciphertext
```

Secret writes and the end-to-end migration use MongoDB **transactions**, so a replica set or Atlas is required.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router), React 19, TypeScript
- MongoDB (official driver)
- Tailwind CSS 4 and shadcn/ui
- Nodemailer for email, Google OAuth for optional social sign-in
- GitHub Actions CI, deployed on Vercel

## Getting started

**Requirements:** Node.js 20+ and MongoDB as **Atlas or a local replica set** (transactions don't work on a standalone server).

```bash
git clone https://github.com/Munishwar001/dotkeep.git
cd dotkeep
npm install
cp .env.example .env.local
```

Generate the encryption key and put it in `.env.local`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then start the app:

```bash
npm run dev
```

Open <http://localhost:3000>. A quick check that the database is reachable: <http://localhost:3000/api/health/db>.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string (Atlas or a replica set) |
| `MONGODB_DB` | No | Database name (defaults to the one in the URI) |
| `VAULT_ENCRYPTION_KEY` | Yes | 32 random bytes, base64. Encrypts every server-side secret and every 2FA secret |
| `APP_URL` | Yes | Public site address, used to build links in emails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Production | Sends verification, reset and alert emails. In development, emails are printed to the terminal when `SMTP_HOST` is empty |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No | Enables "Continue with Google" |

See [.env.example](.env.example) for the full, commented list.

> **Back up `VAULT_ENCRYPTION_KEY`.** If it is lost, every server-side secret and every 2FA secret is unrecoverable. Use the same key on every machine and never commit it. End-to-end secrets don't depend on this key.

### Making an admin

```bash
npm run make-admin -- you@example.com
npm run remove-admin -- you@example.com
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | Type-check the project |
| `npm run lint` | Lint |
| `npm run test:unit` | Fast unit tests, no server needed |
| `npm test` | Unit and API tests (needs the app running and MongoDB) |

CI runs types, lint, unit tests, a production build and the API tests against a throw-away MongoDB on every pull request. See [tests/README.md](tests/README.md).

## Documentation

| Guide | Covers |
|---|---|
| [VAULT_FLOW.md](docs/VAULT_FLOW.md) | Projects, secrets, encryption, history, sharing, backup |
| [SETTINGS_FLOW.md](docs/SETTINGS_FLOW.md) | Profile, password, sessions, 2FA, account deletion |
| [e2ee-study-guide.md](docs/e2ee-study-guide.md) | How end-to-end encryption is built, flow by flow |
| [EMAIL_VERIFICATION_FLOW.md](docs/EMAIL_VERIFICATION_FLOW.md) | Sign-up and email verification |
| [PASSWORD_RESET_FLOW.md](docs/PASSWORD_RESET_FLOW.md) | Password reset and alerts |
| [ADMIN_FLOW.md](docs/ADMIN_FLOW.md) | Admin tools |
| [DB_FLOW.md](docs/DB_FLOW.md) | Collections and indexes |
| [CI_AND_ERRORS.md](docs/CI_AND_ERRORS.md) | CI, error pages, error record, pre-commit hook |

## Running it in production

Dotkeep deploys to [Vercel](https://vercel.com) (configured for the `bom1` region in [vercel.json](vercel.json)) with MongoDB Atlas.

**Before going live**
1. Set every variable above in your host's environment settings, with `APP_URL` set to your real `https://` address.
2. Configure SMTP on your own domain (SPF and DKIM) so verification and reset emails arrive.
3. Store `VAULT_ENCRYPTION_KEY` in a password manager as well as in the host.
4. Turn on Atlas backups, and do one test restore.
5. Protect `main` in GitHub and require the **checks** status before merging.

**Not in place yet** (see the roadmap): a Content-Security-Policy and HSTS, error monitoring such as Sentry, encryption-key rotation, and an independent security review.

## Roadmap

Not available yet, and not promised:

- Hardening: CSP and HSTS headers, error monitoring, key rotation, an independent security review
- A way to reset an end-to-end vault if both keys are lost
- Changing your email, dark mode, custom tags
- A terminal (CLI) for pulling and pushing secrets
- Teams or organisations beyond per-project sharing

## Contributing

Work on a feature branch off `dev` and open a pull request. CI must pass before merging.
