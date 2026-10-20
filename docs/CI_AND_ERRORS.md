# CI, error pages, error record, pre-commit hook

## 1. CI (GitHub Actions)

File: `.github/workflows/ci.yml`. Runs on every pull request and on pushes to `main` and `dev`. A newer push to the same branch cancels the older run.

Steps, in order (the first failure stops the run):

| Step | Command |
|---|---|
| Types | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm run test:unit` |
| Build | `npm run build` |
| API tests | start the built app (`npm run start`), then `npm test` |

The API tests need a database, so the job starts a throw-away `mongo:7` service and gives the app a fresh `VAULT_ENCRYPTION_KEY` (masked in the log). Nothing in the workflow is a real secret, and the repository needs no GitHub secrets.

I ran the same steps locally with `.env.local` moved away (as on a clean runner): all steps passed, 92 tests. What I could not run here is GitHub itself, so the first real run on GitHub is the final check.

To make it count: GitHub, Settings, Branches, add a rule for `main` (and `dev`) and tick "Require status checks to pass", choosing **checks**.

## 2. Error pages

| File | When |
|---|---|
| `src/app/not-found.tsx` | An address that doesn't exist, or a page that calls `notFound()` (a project that isn't yours looks the same as one that doesn't exist) |
| `src/app/error.tsx` | Something threw while a page was rendering. Shows "Try again" and an **Error ID** |
| `src/app/global-error.tsx` | The root layout itself failed. Plain markup, no stylesheet |

The Error ID is Next's digest. It is the same id stored in the error record, so a person can quote it and you can find the entry.

Dashboard pages stream, so for them the 200 status goes out before `notFound()` runs and the 404 page is drawn in the browser. Only a completely unknown address returns a real 404 status.

## 3. Error record

`logError()` in `src/lib/logger.ts` is the single place server errors go:

- prints one line to the console (JSON in production, readable in development)
- adds the error to the `server_errors` collection, shown as **Server errors** on `/dashboard/admin`

It is called from every API `catch` (through `handleError`), from the auth routes, and from `src/instrumentation.ts`, which catches what nobody handled (a page that throws, a route handler that crashes).

Privacy:
- Only the error type, message, stack, route, method and digest are stored. Never request headers, cookies, bodies, the query string, or who was logged in.
- Messages are scrubbed first (`src/lib/redact.ts`): emails become `[email]`, passwords inside URLs and `token=` style values become `***`.
- Identical errors are merged into one row with a counter. Rows expire 30 days after they last happened.
- If MongoDB itself is the problem, the record can't be written. The console line is then the only trace.

Sentry or another service: not wired in, because it needs your account and DSN. When you have one, add the call inside `logError()` (and, for browser-side errors, in `error.tsx`); nothing else needs to change.

## 4. Pre-commit hook

`.githooks/pre-commit` runs before every commit: ESLint on the staged files, then `tsc --noEmit` for the whole project. It does nothing when no code is staged. Tests and the build are left to CI, so commits stay quick.

It is installed by `npm install` (the `prepare` script sets `git config core.hooksPath .githooks`), with no extra package. Skip it once with `git commit --no-verify`.

On a fresh clone, run `npm install` once. If hooks don't run on Linux or macOS, check the file is executable: `chmod +x .githooks/pre-commit`. `.gitattributes` keeps the hook on Unix line endings.

Staged files are linted as they are in your working folder, so if you stage only part of a file, lint sees the whole file.
