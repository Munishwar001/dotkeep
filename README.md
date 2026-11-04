# Dotkeep

**A secure home for your project secrets.** Keep API keys, tokens, webhook URLs and `.env` values in one encrypted vault, organised by project and environment, with an audit trail and team sharing.

[![CI](https://github.com/Munishwar001/dotkeep/actions/workflows/ci.yml/badge.svg)](https://github.com/Munishwar001/dotkeep/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![MongoDB](https://img.shields.io/badge/MongoDB-7-47a248)

---

## Why Dotkeep

Secrets end up in chat messages, notes and loose `.env` files. Dotkeep gives them one place to live, so you always know where a value is, who touched it, and who can see it.

## Features

**Vault**
- Projects with **local**, **staging** and **production** environments, and typed secrets (API key, access token, webhook URL, database URL, environment variable).
- Values are **encrypted before they are stored** and never appear in lists. A value is fetched only on Reveal or Copy, and auto-hides again (5, 15, 30 or 60 seconds, your choice).
- **Version history:** the last 20 values of each secret are kept, and you can reveal or restore any of them.
- **Environments view:** one row per secret name with a column per environment, with gaps marked.
- **Bulk edit:** move, retype or delete up to 200 secrets at once.

**Import, export and backup**
- Import and export a single environment as `.env` or JSON.
- One-click **whole-vault backup and restore**.

**Teams**
- Share a project by email as **owner**, **editor** or **viewer**. Access changes take effect immediately.
- An **audit log** records who viewed, changed, moved, imported or exported what, and when. It never records values.

**Account security**
- Email and password sign-in with verification, or Google sign-in.
- **Two-factor authentication** (authenticator app) with one-time recovery codes.
- **Protect secret values:** require a 2FA code before Reveal, Copy or Export.
- Session list with per-device sign-out, and password-change alerts by email.
- Admin area for user management and a server error record.

## How secrets are protected

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

> **Not end-to-end encrypted.** Values are encrypted on the server with a key the server holds, so the server can decrypt them when you reveal one. This protects you if the database leaks, but not if the server itself is compromised. Use 2FA and *Protect secret values* for extra protection, and treat the encryption key as the crown jewels.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router), React 19, TypeScript
- MongoDB (official driver)
- Tailwind CSS 4 and shadcn/ui
- Nodemailer for email, Google OAuth for optional social sign-in
- GitHub Actions CI, deployable on Vercel

## Getting started

**Requirements:** Node.js 20+ and a MongoDB database (local or Atlas).

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

Open <http://localhost:3000>.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MONGODB_DB` | No | Database name (defaults to the one in the URI) |
| `VAULT_ENCRYPTION_KEY` | Yes | 32 random bytes, base64. Encrypts every secret and every 2FA secret |
| `APP_URL` | Yes | Public site address, used to build links in emails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Production | Sends verification, reset and alert emails. In development, emails are printed to the terminal when `SMTP_HOST` is empty |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No | Enables "Continue with Google" |

> **Back up `VAULT_ENCRYPTION_KEY`.** If it is lost, every stored secret and every 2FA secret is unrecoverable. Use the same key on every machine and never commit it.

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

In-app help lives at **Dashboard → Docs**. Deeper write-ups of each area are in [docs/](docs):

| Guide | Covers |
|---|---|
| [VAULT_FLOW.md](docs/VAULT_FLOW.md) | Projects, secrets, encryption, history, sharing, backup |
| [SETTINGS_FLOW.md](docs/SETTINGS_FLOW.md) | Profile, password, sessions, 2FA, account deletion |
| [EMAIL_VERIFICATION_FLOW.md](docs/EMAIL_VERIFICATION_FLOW.md) | Sign-up and email verification |
| [PASSWORD_RESET_FLOW.md](docs/PASSWORD_RESET_FLOW.md) | Password reset and alerts |
| [ADMIN_FLOW.md](docs/ADMIN_FLOW.md) | Admin tools |
| [DB_FLOW.md](docs/DB_FLOW.md) | Collections and indexes |
| [CI_AND_ERRORS.md](docs/CI_AND_ERRORS.md) | CI, error pages, error record, pre-commit hook |

## Deploying

Dotkeep deploys to [Vercel](https://vercel.com) (configured for the `bom1` region in [vercel.json](vercel.json)) with MongoDB Atlas. Before going live:

1. Set every variable above in your host's environment settings, with `APP_URL` set to your real `https://` address.
2. Configure SMTP so verification and reset emails can be sent.
3. Store `VAULT_ENCRYPTION_KEY` in a password manager as well as in the host.
4. Protect `main` in GitHub and require the **checks** status before merging.

## Roadmap

Not available yet, and not promised: changing your email, dark mode, custom tags, a terminal (CLI) for pulling and pushing secrets, and teams or organisations beyond per-project sharing.

## Contributing

Work on a feature branch off `dev` and open a pull request. CI must pass before merging.
