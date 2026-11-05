/**
 * Security checks from the outside: what an attacker with no account, or someone else's account, can and can't do.
 * Needs `npm run dev` running (see tests/helpers.mjs). Authorization between owners, editors and viewers is covered in
 * sharing.test.mjs; this file covers everything around it.
 *
 * This is automated regression testing. It does not replace an independent review or penetration test.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BASE, client, createWorld, PASSWORD } from "../helpers.mjs";

const SECRET_VALUE = "sk_live_SUPER-SECRET-VALUE-123";
const ID = "0".repeat(24);

let world, owner, other, admin, project, secret;

before(async () => {
  world = await createWorld();
  [owner, other, admin] = [await world.user("owner"), await world.user("other"), await world.user("admin", { role: "admin" })];
  project = (await owner.call("POST", "/api/vault/projects", { name: "Sec", description: "" })).data.project;
  secret = (await owner.call("POST", "/api/vault/secrets", { projectId: project.id, name: "TOKEN", environment: "production", type: "api_key", value: SECRET_VALUE })).data.secret;
});
after(() => world.close());

/** Every API route that needs a session, with the method it uses. */
const PROTECTED = [
  ["GET", "/api/vault/projects"],
  ["POST", "/api/vault/projects"],
  ["PATCH", `/api/vault/projects/${ID}`],
  ["DELETE", `/api/vault/projects/${ID}`],
  ["GET", `/api/vault/projects/${ID}/members`],
  ["POST", `/api/vault/projects/${ID}/members`],
  ["PATCH", `/api/vault/projects/${ID}/members/${ID}`],
  ["DELETE", `/api/vault/projects/${ID}/members/${ID}`],
  ["GET", "/api/vault/secrets"],
  ["POST", "/api/vault/secrets"],
  ["POST", "/api/vault/secrets/bulk"],
  ["PATCH", `/api/vault/secrets/${ID}`],
  ["DELETE", `/api/vault/secrets/${ID}`],
  ["POST", `/api/vault/secrets/${ID}/reveal`],
  ["GET", `/api/vault/secrets/${ID}/activity`],
  ["GET", `/api/vault/secrets/${ID}/versions`],
  ["POST", `/api/vault/secrets/${ID}/versions/${ID}/reveal`],
  ["POST", `/api/vault/secrets/${ID}/versions/${ID}/restore`],
  ["POST", "/api/vault/export"],
  ["POST", "/api/vault/import"],
  ["POST", "/api/vault/backup/export"],
  ["POST", "/api/vault/backup/import"],
  ["PATCH", "/api/account/profile"],
  ["PATCH", "/api/account/preferences"],
  ["POST", "/api/account/password"],
  ["DELETE", "/api/account"],
  ["DELETE", "/api/account/sessions/others"],
  ["DELETE", `/api/account/sessions/${ID}`],
  ["POST", "/api/account/2fa/setup"],
  ["POST", "/api/account/2fa/enable"],
  ["POST", "/api/account/2fa/disable"],
  ["POST", "/api/account/2fa/verify"],
  ["POST", "/api/account/2fa/recovery-codes"],
  ["POST", "/api/account/2fa/secrets-lock"],
  ["PATCH", `/api/admin/users/${ID}`],
  ["DELETE", `/api/admin/users/${ID}`],
  ["PATCH", "/api/admin/preferences"],
];

describe("no session", () => {
  it("every protected API route answers 401 and reveals nothing", async () => {
    const anonymous = client();
    for (const [method, path] of PROTECTED) {
      const r = await anonymous(method, path, method === "GET" ? undefined : {});
      assert.equal(r.status, 401, `${method} ${path}`);
    }
  });

  it("dashboard pages redirect to the login page", async () => {
    for (const path of ["/dashboard", "/dashboard/vault", "/dashboard/settings", "/dashboard/admin"]) {
      const response = await client()("GET", path, undefined, true);
      assert.equal(response.status, 307, path);
      assert.equal(new URL(response.headers.get("location"), BASE).pathname, "/login", path);
    }
  });

  it("a made-up, malformed or expired session cookie is not a session", async () => {
    for (const cookie of ["dotkeep_session=", "dotkeep_session=abc", "dotkeep_session=%00", `dotkeep_session=${"A".repeat(5000)}`]) {
      assert.equal((await client(cookie)("GET", "/api/vault/projects")).status, 401, cookie.slice(0, 30));
    }

    const expired = await world.user("expired");
    await world.db.collection("sessions").updateMany({ userId: expired.objectId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await expired.call("GET", "/api/vault/projects")).status, 401);
  });
});

describe("cross-site requests (CSRF)", () => {
  const forge = (user, headers) =>
    fetch(`${BASE}/api/vault/projects`, { method: "POST", headers: { cookie: user.cookie, ...headers }, body: JSON.stringify({ name: "Csrf", description: "" }), redirect: "manual" });

  it("rejects a state-changing request from another origin, even with a valid session", async () => {
    const user = await world.user("csrf");
    assert.equal((await forge(user, { origin: "https://evil.example", "content-type": "application/json" })).status, 403);
    assert.equal((await forge(user, { "content-type": "application/json" })).status, 403);
    assert.equal((await forge(user, { origin: BASE, "content-type": "text/plain" })).status, 403);
    assert.equal((await forge(user, { origin: BASE, "content-type": "application/json" })).status, 201);
    const created = await world.db.collection("projects").countDocuments({ userId: user.objectId });
    assert.equal(created, 1, "only the same-origin request may create anything");
  });

  it("rejects wrong Origin, missing Origin and non-JSON bodies on login", async () => {
    const body = JSON.stringify({ email: "a@example.com", password: PASSWORD });
    const attempts = [
      { origin: "https://evil.example", "content-type": "application/json" },
      { "content-type": "application/json" },
      { origin: BASE, "content-type": "text/plain" },
      { origin: BASE, "content-type": "application/x-www-form-urlencoded" },
    ];
    for (const headers of attempts) {
      const response = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers, body, redirect: "manual" });
      assert.equal(response.status, 403, JSON.stringify(headers));
    }
  });
});

describe("the session cookie and sign-in", () => {
  // Signup is limited to 10 per hour per IP, so these tests share one account (and one more for the lockout).
  let account;
  before(async () => {
    account = await world.signedUp("signin");
  });

  it("is HttpOnly, SameSite=Lax and scoped to /", async () => {
    const response = await account.call("POST", "/api/auth/login", { email: account.email, password: PASSWORD }, true);
    assert.equal(response.status, 200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /^dotkeep_session=[^;]+/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=lax/i);
    assert.match(setCookie, /Path=\//i);
    // Nothing about the password or 2FA comes back with the signed-in user.
    assert.ok(!/passwordHash|scrypt$|recoveryCodes/i.test(await response.text()));
  });

  it("answers the same for an unknown email and a wrong password", async () => {
    const unknown = await client()("POST", "/api/auth/login", { email: `nobody-${Date.now()}@example.com`, password: PASSWORD });
    const wrong = await client()("POST", "/api/auth/login", { email: account.email, password: "Wrong-password-1!" });
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.deepEqual(unknown.data, wrong.data);
  });

  it("logging out kills the session on the server, not just in the browser", async () => {
    const user = await world.user("logout");
    assert.equal((await user.call("GET", "/api/vault/projects")).status, 200);
    assert.equal((await user.call("POST", "/api/auth/logout", {})).status, 200);
    assert.equal((await user.call("GET", "/api/vault/projects")).status, 401);
  });

  it("locks out password guessing after 10 tries", async () => {
    const user = await world.signedUp("brute");
    let last;
    for (let i = 0; i < 11; i++) last = await client()("POST", "/api/auth/login", { email: user.email, password: `Wrong-${i}-password!` });
    assert.equal(last.status, 429);
    // Even the right password is refused while locked, so the lock can't be used to confirm a guess.
    assert.equal((await user.login()).status, 429);
  });
});

describe("secrets never leak", () => {
  it("lists, activity and versions carry no value or ciphertext", async () => {
    await owner.call("PATCH", `/api/vault/secrets/${secret.id}`, { value: "second-value-XYZ" });
    for (const path of ["/api/vault/secrets", "/api/vault/projects", `/api/vault/secrets/${secret.id}/activity`, `/api/vault/secrets/${secret.id}/versions`]) {
      const text = JSON.stringify((await owner.call("GET", path)).data);
      assert.ok(!text.includes(SECRET_VALUE), `${path} leaks the value`);
      assert.ok(!text.includes("second-value-XYZ"), `${path} leaks the value`);
      assert.ok(!/ciphertext|iv"|authTag|encrypted/i.test(text), `${path} exposes encryption fields`);
    }
  });

  it("the database holds ciphertext, not the value", async () => {
    const docs = await world.db.collection("secrets").find({ userId: owner.objectId }).toArray();
    const versions = await world.db.collection("secret_versions").find({ userId: owner.objectId }).toArray();
    const all = JSON.stringify([...docs, ...versions]);
    assert.ok(!all.includes(SECRET_VALUE));
    assert.ok(!all.includes("second-value-XYZ"));
  });

  it("the audit log never holds a value", async () => {
    const events = JSON.stringify(await world.db.collection("secret_events").find({ userId: owner.objectId }).toArray());
    assert.ok(!events.includes(SECRET_VALUE));
    assert.ok(!events.includes("second-value-XYZ"));
  });

  it("responses that carry values are never cacheable", async () => {
    const response = await owner.call("POST", `/api/vault/secrets/${secret.id}/reveal`, {}, true);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.match((await owner.call("GET", "/api/vault/secrets", undefined, true)).headers.get("cache-control") ?? "", /no-store/);
  });
});

describe("another user's data", () => {
  it("can't be read, changed or deleted by guessing ids", async () => {
    assert.equal((await other.call("POST", `/api/vault/secrets/${secret.id}/reveal`, {})).status, 404);
    assert.equal((await other.call("PATCH", `/api/vault/secrets/${secret.id}`, { name: "HIJACK" })).status, 404);
    assert.equal((await other.call("DELETE", `/api/vault/secrets/${secret.id}`)).status, 404);
    // The activity log answers with an empty list for secrets you can't open, rather than 404. Either way, no events leak.
    const activity = await other.call("GET", `/api/vault/secrets/${secret.id}/activity`);
    assert.ok(activity.status === 404 || (activity.status === 200 && activity.data.events.length === 0));
    assert.equal((await other.call("GET", `/api/vault/secrets/${secret.id}/versions`)).status, 404);
    assert.equal((await other.call("PATCH", `/api/vault/projects/${project.id}`, { name: "HIJACK" })).status, 404);
    assert.equal((await other.call("DELETE", `/api/vault/projects/${project.id}`)).status, 404);
    // Still there, still untouched.
    assert.equal((await owner.call("POST", `/api/vault/secrets/${secret.id}/reveal`, {})).status, 200);
  });

  it("can't be written into by creating a secret in someone else's project", async () => {
    const r = await other.call("POST", "/api/vault/secrets", { projectId: project.id, name: "PLANT", environment: "local", type: "other", value: "x" });
    assert.equal(r.status, 404);
  });

  it("can't be pulled out through bulk, import, export or backup", async () => {
    assert.equal((await other.call("POST", "/api/vault/secrets/bulk", { ids: [secret.id], action: "delete" })).data?.affected ?? 0, 0);
    const exported = await other.call("POST", "/api/vault/export", { projectId: project.id, environment: "production", format: "env" });
    assert.ok(exported.status >= 400);
    const backup = await other.call("POST", "/api/vault/backup/export", {}, true);
    assert.ok(!(await backup.text()).includes(SECRET_VALUE));
    assert.equal((await owner.call("POST", `/api/vault/secrets/${secret.id}/reveal`, {})).status, 200);
  });
});

describe("hostile input", () => {
  it("NoSQL operators in place of strings are rejected, not run", async () => {
    const login = (body) => client()("POST", "/api/auth/login", body);
    assert.equal((await login({ email: { $ne: "" }, password: { $ne: "" } })).status, 400);
    assert.equal((await login({ email: "a@example.com", password: { $gt: "" } })).status, 400);
    assert.equal((await owner.call("POST", "/api/vault/secrets", { projectId: { $ne: null }, name: "X", environment: "local", type: "other", value: "v" })).status, 400);
    assert.ok([400, 404].includes((await owner.call("PATCH", `/api/vault/secrets/${secret.id}`, { name: { $set: { userId: other.id } } })).status));
  });

  it("malformed ids and bodies give a clean error, never a 500", async () => {
    for (const id of ["not-an-id", "%24ne", "..%2F..%2Fetc", "0", "z".repeat(24), "0".repeat(200)]) {
      for (const [method, path] of [["POST", `/api/vault/secrets/${id}/reveal`], ["GET", `/api/vault/secrets/${id}/versions`], ["DELETE", `/api/vault/projects/${id}`]]) {
        const r = await owner.call(method, path, method === "POST" ? {} : undefined);
        assert.ok(r.status >= 400 && r.status < 500, `${method} ${path} gave ${r.status}`);
      }
    }
    for (const body of [null, [], "text", 12345, { name: "x".repeat(100000) }]) {
      const r = await owner.call("POST", "/api/vault/projects", body);
      assert.ok(r.status >= 400 && r.status < 500, JSON.stringify(body)?.slice(0, 30));
    }
    const garbage = await fetch(`${BASE}/api/vault/projects`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, cookie: "" }, body: "{not json" });
    assert.ok(garbage.status < 500);
  });

  it("script in a name is stored as text and returned as JSON, not interpreted", async () => {
    const payload = `<img src=x onerror=alert(1)>`;
    const r = await owner.call("POST", "/api/vault/projects", { name: payload, description: "" });
    assert.ok(r.status === 201 || r.status === 400);
    if (r.status === 201) assert.equal(r.data.project.name, payload);
    const response = await owner.call("GET", "/api/vault/projects", undefined, true);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  });

  it("extra fields can't make you an admin or change someone else's account", async () => {
    const user = await world.user("mass");
    await user.call("PATCH", "/api/account/profile", { name: "Mass", role: "admin", emailVerified: false, _id: other.id, userId: other.id });
    await user.call("PATCH", "/api/account/preferences", { role: "admin", revealSeconds: 15 });
    const mine = await world.db.collection("users").findOne({ _id: user.objectId });
    assert.notEqual(mine.role, "admin");
    assert.equal(mine.emailVerified, true);
    const theirs = await world.db.collection("users").findOne({ _id: other.objectId });
    assert.equal(theirs.name, other.name);
  });
});

describe("admin area", () => {
  it("a normal user gets 404 from every admin route, and can't promote themselves", async () => {
    assert.equal((await owner.call("PATCH", `/api/admin/users/${other.id}`, { action: "block" })).status, 404);
    assert.equal((await owner.call("DELETE", `/api/admin/users/${other.id}`)).status, 404);
    assert.equal((await owner.call("PATCH", "/api/admin/preferences", {})).status, 404);
    assert.equal((await owner.call("PATCH", `/api/admin/users/${owner.id}`, { role: "admin", action: "make-admin" })).status, 404);
    const still = await world.db.collection("users").findOne({ _id: other.objectId });
    assert.ok(still && !still.blocked && !still.blockedAt);
  });

  it("an admin can't read another user's secret values", async () => {
    assert.equal((await admin.call("POST", `/api/vault/secrets/${secret.id}/reveal`, {})).status, 404);
    assert.ok(!JSON.stringify((await admin.call("GET", "/api/vault/secrets")).data).includes(SECRET_VALUE));
  });
});

describe("response headers", () => {
  it("pages and APIs send the baseline protections and hide the framework", async () => {
    for (const path of ["/", "/login", "/api/health"]) {
      const response = await client()("GET", path, undefined, true);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
      assert.equal(response.headers.get("x-frame-options"), "DENY", path);
      assert.ok(response.headers.get("referrer-policy"), path);
      assert.ok(response.headers.get("permissions-policy"), path);
      assert.equal(response.headers.get("x-powered-by"), null, path);
    }
  });
});
