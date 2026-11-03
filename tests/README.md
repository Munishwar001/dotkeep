# Tests

```bash
npm run test:unit   # no server needed, runs in about a second
npm test            # everything: unit + API tests
```

Uses Node's built-in test runner. No extra packages.

## What is here

| Folder | What it checks | Needs |
|---|---|---|
| `tests/unit/` | `.env` parser and writer, email masking, vault encryption (round trip, tampering, wrong context) | nothing |
| `tests/api/vault.test.mjs` | `.env` import/export, version history, move, bulk edit/delete, audit log, other users can't touch any of it | server + MongoDB |
| `tests/api/sharing.test.mjs` | Project sharing: owner / editor / viewer / outsider, 404 vs 403, moving between owners, who sees the audit log | server + MongoDB |
| `tests/api/two-factor.test.mjs` | 2FA: setup, the code step at login, replay and 5-wrong-codes limits, recovery codes, turning it off | server + MongoDB |
| `tests/api/admin.test.mjs` | Admin block / unblock / delete, guards (self, other admins), email masking on the server | server + MongoDB |

## Running the API tests

1. Start the app: `npm run dev` (port 3000, or set `TEST_BASE_URL`).
2. `npm test` (it loads `.env.local` for `MONGODB_URI`, `MONGODB_DB` and talks to the same database as the server).

Each suite creates its own users (`e2e-…@example.com`), signs them in with a session written straight to the database
(so signup and login rate limits don't get in the way), and deletes the users and everything they own when it
finishes. Other data in the database is not touched. If a run is killed halfway, leftover users can be removed
with: `db.users.deleteMany({ email: /^e2e-.*@example\.com$/ })`.

`next dev` sometimes answers a page request with a 500 while it compiles that page for the first time. Page
checks go through `user.page()`, which retries a few times.

## Adding a test

- Pure functions: add `tests/unit/<name>.test.mjs`. Importing `src/lib/*.ts` works directly (Node strips the types),
  as long as the file doesn't use the `@/` alias.
- API behaviour: copy the shape of `tests/api/sharing.test.mjs` and use `createWorld()` from `tests/helpers.mjs`.
