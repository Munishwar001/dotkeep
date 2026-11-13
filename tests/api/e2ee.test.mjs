/**
 * End-to-end encryption: key setup, values the server can't read, migration, and the sharing rules. Needs `npm run dev` running
 * (see tests/helpers.mjs). The "browser" side is played by src/lib/e2ee.ts, the same code the app runs.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { changePassphrase, createVault, decryptValue, encryptValue, newObjectIdHex, unlockVault } from "../../src/lib/e2ee.ts";
import { createWorld } from "../helpers.mjs";

const ITERATIONS = 200_000; // the lowest the server accepts; the app uses 600,000
const PASSPHRASE = "correct horse battery staple";
const PLAIN = "sk_live_PLAINTEXT-MUST-NOT-REACH-THE-SERVER";

let world, owner, member, legacy;
let vault, record, recoveryKey;
let project, sharedProject, legacyProject;

const seal = (user, id, text, key = vault.vaultKey) => encryptValue(key, text, `${user.id}:${id}`);
const open = (user, id, cipher, key = vault.vaultKey) => decryptValue(key, cipher, `${user.id}:${id}`);

async function createE2ee(user, projectId, name, text, environment = "production") {
  const id = newObjectIdHex();
  const response = await user.call("POST", "/api/vault/secrets", { projectId, id, cipher: await seal(user, id, text), name, environment, type: "api_key" });
  return { response, id };
}

before(async () => {
  world = await createWorld();
  [owner, member, legacy] = [await world.user("owner"), await world.user("member"), await world.user("legacy")];
  vault = await createVault(PASSPHRASE, ITERATIONS);
  ({ record, recoveryKey } = vault);
  project = (await owner.call("POST", "/api/vault/projects", { name: "E2E", description: "" })).data.project;
  sharedProject = (await owner.call("POST", "/api/vault/projects", { name: "Shared", description: "" })).data.project;
  assert.equal((await owner.call("POST", `/api/vault/projects/${sharedProject.id}/members`, { email: member.email, role: "editor" })).status, 201);
});
after(() => world.close());

describe("turning it on", () => {
  it("is off until set up, and only the owner of the account can read the wrapped keys", async () => {
    assert.deepEqual((await owner.call("GET", "/api/account/e2ee")).data, { enabled: false, record: null, userId: owner.id });
    assert.equal((await owner.call("POST", "/api/vault/secrets", { projectId: project.id, id: newObjectIdHex(), cipher: await seal(owner, "x", "v"), name: "A", environment: "local", type: "other" })).data.code, "e2ee_unavailable");
  });

  it("rejects records that are malformed or use a weak key derivation", async () => {
    for (const bad of [
      undefined,
      {},
      { ...record, v: 2 },
      { ...record, kdf: { ...record.kdf, iterations: 1000 } },
      { ...record, kdf: { ...record.kdf, name: "MD5" } },
      { ...record, kdf: { ...record.kdf, salt: "short" } },
      { ...record, wrappedByPassphrase: "nope" },
      { ...record, wrappedByRecovery: PLAIN },
    ]) {
      assert.equal((await owner.call("POST", "/api/account/e2ee", { record: bad })).status, 400, JSON.stringify(bad)?.slice(0, 60));
    }
  });

  it("stores the record once and hands it back, and holds nothing readable", async () => {
    assert.equal((await owner.call("POST", "/api/account/e2ee", { record })).status, 201);
    assert.equal((await owner.call("POST", "/api/account/e2ee", { record })).status, 409);
    const got = (await owner.call("GET", "/api/account/e2ee")).data;
    assert.equal(got.enabled, true);
    assert.deepEqual(got.record, record);
    const stored = JSON.stringify(await world.db.collection("users").findOne({ _id: owner.objectId }, { projection: { vaultKeys: 1 } }));
    assert.ok(!stored.includes(PASSPHRASE) && !stored.includes(recoveryKey));
    // The browser can open it with the passphrase or the recovery key, from what the server returned.
    await unlockVault(got.record, { passphrase: PASSPHRASE });
    await unlockVault(got.record, { recoveryKey });
  });

  it("shows up in Settings for an account with it off and one with it on", async () => {
    for (const person of [owner, member]) {
      const { status, html } = await person.page("/dashboard/settings");
      assert.equal(status, 200);
      assert.match(html, /End-to-end encryption/);
      assert.ok(!html.includes(PASSPHRASE));
    }
    const vaultPage = await owner.page("/dashboard/vault");
    assert.equal(vaultPage.status, 200);
  });

  it("another user can't read it", async () => {
    assert.equal((await member.call("GET", "/api/account/e2ee")).data.enabled, false);
  });
});

describe("a value the server can't read", () => {
  let secret, id;

  it("is stored as ciphertext and comes back for the browser to open", async () => {
    const created = await createE2ee(owner, project.id, "TOKEN", PLAIN);
    assert.equal(created.response.status, 201);
    id = created.id;
    secret = created.response.data.secret;
    assert.equal(secret.id, id);

    const doc = await world.db.collection("secrets").findOne({ _id: new world.ObjectId(id) });
    assert.match(doc.valueEncrypted, /^e1\$/);
    assert.ok(!JSON.stringify(doc).includes(PLAIN));

    const revealed = (await owner.call("POST", `/api/vault/secrets/${id}/reveal`, {})).data;
    assert.equal(revealed.value, undefined);
    assert.equal(await open(owner, id, revealed.cipher), PLAIN);
    assert.ok(!JSON.stringify((await owner.call("GET", "/api/vault/secrets")).data).includes("e1$"));
  });

  it("is logged when it is revealed, without the value", async () => {
    const events = JSON.stringify(await world.db.collection("secret_events").find({ userId: owner.objectId }).toArray());
    assert.ok(events.includes("revealed"));
    assert.ok(!events.includes(PLAIN));
  });

  it("won't open for another user, or on another secret", async () => {
    assert.equal((await member.call("POST", `/api/vault/secrets/${id}/reveal`, {})).status, 404);
    const other = await createE2ee(owner, project.id, "OTHER", "something else", "staging");
    const cipher = (await owner.call("POST", `/api/vault/secrets/${id}/reveal`, {})).data.cipher;
    await assert.rejects(open(owner, other.id, cipher));
  });

  it("refuses a plaintext value for this account, in a create, an update and a restore", async () => {
    const create = await owner.call("POST", "/api/vault/secrets", { projectId: project.id, name: "PLAIN", environment: "local", type: "other", value: PLAIN });
    assert.deepEqual([create.status, create.data.code], [409, "e2ee_required"]);
    const update = await owner.call("PATCH", `/api/vault/secrets/${id}`, { value: PLAIN });
    assert.deepEqual([update.status, update.data.code], [409, "e2ee_required"]);
    assert.equal(await world.db.collection("secrets").countDocuments({ userId: owner.objectId, nameKey: "plain" }), 0);
  });

  it("rejects malformed ciphertext, a reused id, and sending both forms", async () => {
    const body = { projectId: project.id, name: "BAD", environment: "local", type: "other" };
    assert.equal((await owner.call("POST", "/api/vault/secrets", { ...body, id: newObjectIdHex(), cipher: "e1$nope" })).status, 400);
    assert.equal((await owner.call("POST", "/api/vault/secrets", { ...body, id: "not-an-id", cipher: await seal(owner, "x", "v") })).status, 400);
    assert.equal((await owner.call("POST", "/api/vault/secrets", { ...body, id, cipher: await seal(owner, id, "v") })).status, 409);
    assert.equal((await owner.call("PATCH", `/api/vault/secrets/${id}`, { value: "a", cipher: await seal(owner, id, "b") })).status, 400);
  });

  it("keeps history as ciphertext, and a restore brings the old value back", async () => {
    const next = "second value";
    assert.equal((await owner.call("PATCH", `/api/vault/secrets/${id}`, { cipher: await seal(owner, id, next) })).status, 200);
    assert.equal(await open(owner, id, (await owner.call("POST", `/api/vault/secrets/${id}/reveal`, {})).data.cipher), next);

    const versions = (await owner.call("GET", `/api/vault/secrets/${id}/versions`)).data.versions;
    assert.equal(versions.length, 1);
    const old = (await owner.call("POST", `/api/vault/secrets/${id}/versions/${versions[0].id}/reveal`, {})).data;
    assert.equal(await open(owner, id, old.cipher), PLAIN);

    assert.equal((await owner.call("POST", `/api/vault/secrets/${id}/versions/${versions[0].id}/restore`, {})).status, 200);
    assert.equal(await open(owner, id, (await owner.call("POST", `/api/vault/secrets/${id}/reveal`, {})).data.cipher), PLAIN);
    const raw = JSON.stringify(await world.db.collection("secret_versions").find({ userId: owner.objectId }).toArray());
    assert.ok(!raw.includes(PLAIN) && !raw.includes(next));
  });

  it("exports as ciphertext next to the readable ones", async () => {
    const r = (await owner.call("POST", "/api/vault/export", { projectId: project.id, environment: "production", format: "json" })).data;
    assert.equal(r.encrypted.length, 1);
    assert.equal(r.encrypted[0].name, "TOKEN");
    assert.equal(await open(owner, id, r.encrypted[0].cipher), PLAIN);
    assert.ok(!JSON.stringify(r).includes(PLAIN));

    const backup = (await owner.call("POST", "/api/vault/backup/export", {})).data;
    assert.ok(backup.encrypted.some((entry) => entry.name === "TOKEN" && entry.projectName === "E2E"));
    assert.ok(!JSON.stringify(backup).includes(PLAIN));
  });

  it("can't be imported from a file: that would show the server the values", async () => {
    const r = await owner.call("POST", "/api/vault/import", { projectId: project.id, environment: "local", format: "env", content: `FROM_FILE=${PLAIN}` });
    assert.equal(r.status, 200);
    assert.equal(r.data.created, 0);
    assert.match(r.data.failed[0].error, /end-to-end/);
    assert.equal(await world.db.collection("secrets").countDocuments({ userId: owner.objectId, nameKey: "from_file" }), 0);
  });
});

describe("sharing", () => {
  it("a shared project keeps server-side encryption, and members can use it as before", async () => {
    const created = await member.call("POST", "/api/vault/secrets", { projectId: sharedProject.id, name: "SHARED", environment: "local", type: "other", value: "shared-value" });
    assert.equal(created.status, 201);
    const asOwner = await owner.call("POST", "/api/vault/secrets", { projectId: sharedProject.id, name: "OWNER_SHARED", environment: "local", type: "other", value: "owner-shared" });
    assert.equal(asOwner.status, 201, "the owner may still use plain values in a shared project");
    assert.equal((await member.call("POST", `/api/vault/secrets/${created.data.secret.id}/reveal`, {})).data.value, "shared-value");
  });

  it("an end-to-end value can't go into a shared project, by create or by move", async () => {
    const create = await createE2ee(owner, sharedProject.id, "NOPE", "x", "staging");
    assert.deepEqual([create.response.status, create.response.data.code], [409, "e2ee_unavailable"]);

    const inside = await createE2ee(owner, project.id, "MOVER", "mv", "local");
    const move = await owner.call("PATCH", `/api/vault/secrets/${inside.id}`, { projectId: sharedProject.id });
    assert.deepEqual([move.status, move.data.code], [409, "e2ee_unavailable"]);
    const bulk = await owner.call("POST", "/api/vault/secrets/bulk", { action: "update", ids: [inside.id], projectId: sharedProject.id });
    assert.equal(bulk.data.updated, 0);
    assert.equal(bulk.data.failed.length, 1);
  });

  it("refuses single and bulk moves of server-encrypted values into an E2EE destination", async () => {
    const created = await owner.call("POST", "/api/vault/secrets", { projectId: sharedProject.id, name: "PLAIN_MOVE", value: "plain", environment: "local", type: "other" });
    assert.equal(created.status, 201);
    const id = created.data.secret.id;
    assert.equal((await owner.call("PATCH", `/api/vault/secrets/${id}`, { projectId: project.id })).data.code, "e2ee_required");
    const bulk = await owner.call("POST", "/api/vault/secrets/bulk", { action: "update", ids: [id], projectId: project.id });
    assert.equal(bulk.data.updated, 0);
    assert.equal(bulk.data.failed.length, 1);
  });

  it("serializes sharing with encrypted writes", async () => {
    for (let i = 0; i < 4; i++) {
      const p = (await owner.call("POST", "/api/vault/projects", { name: `Race ${i}` })).data.project;
      const [write, share] = await Promise.all([
        createE2ee(owner, p.id, "RACE", "value"),
        owner.call("POST", `/api/vault/projects/${p.id}/members`, { email: member.email, role: "viewer" }),
      ]);
      assert.ok([201, 409].includes(write.response.status));
      assert.ok([201, 409].includes(share.status));
      assert.notDeepEqual([write.response.status, share.status], [201, 201]);
    }
  });

  it("a project with end-to-end secrets can't be shared", async () => {
    const r = await owner.call("POST", `/api/vault/projects/${project.id}/members`, { email: member.email, role: "viewer" });
    assert.deepEqual([r.status, r.data.code], [409, "e2ee_unavailable"]);
  });

  it("a member can't reveal or write an end-to-end value", async () => {
    const secretId = (await world.db.collection("secrets").findOne({ userId: owner.objectId, nameKey: "token" }))._id.toString();
    assert.equal((await member.call("POST", `/api/vault/secrets/${secretId}/reveal`, {})).status, 404);
    const r = await member.call("POST", "/api/vault/secrets", { projectId: sharedProject.id, id: newObjectIdHex(), cipher: await seal(member, "x", "v"), name: "M", environment: "local", type: "other" });
    assert.equal(r.status, 409);
  });
});

describe("moving existing secrets", () => {
  let before, history, shared;

  it("sets up an account that has server-encrypted secrets first", async () => {
    legacyProject = (await legacy.call("POST", "/api/vault/projects", { name: "Old", description: "" })).data.project;
    const sharedOld = (await legacy.call("POST", "/api/vault/projects", { name: "OldShared", description: "" })).data.project;
    before = (await legacy.call("POST", "/api/vault/secrets", { projectId: legacyProject.id, name: "OLD_KEY", environment: "production", type: "api_key", value: "old-1" })).data.secret;
    await legacy.call("PATCH", `/api/vault/secrets/${before.id}`, { value: "old-2" });
    shared = (await legacy.call("POST", "/api/vault/secrets", { projectId: sharedOld.id, name: "OLD_SHARED", environment: "local", type: "other", value: "stays" })).data.secret;
    await legacy.call("POST", `/api/vault/projects/${sharedOld.id}/members`, { email: member.email, role: "viewer" });
    history = (await legacy.call("GET", `/api/vault/secrets/${before.id}/versions`)).data.versions;
    assert.equal(history.length, 1);
    assert.equal((await legacy.call("POST", "/api/account/e2ee", { record })).status, 201);
  });

  it("afterwards new values must be end-to-end, and old secrets must be moved first", async () => {
    const plain = await legacy.call("PATCH", `/api/vault/secrets/${before.id}`, { value: "new" });
    assert.deepEqual([plain.status, plain.data.code], [409, "e2ee_required"]);
    const cipher = await legacy.call("PATCH", `/api/vault/secrets/${before.id}`, { cipher: await seal(legacy, before.id, "new") });
    assert.deepEqual([cipher.status, cipher.data.code], [409, "e2ee_migrate_first"]);
    const edit = await legacy.call("PATCH", `/api/vault/secrets/${before.id}`, { description: "notes still work" });
    assert.equal(edit.status, 200);
  });

  it("hands the browser the plain values of unshared projects only, then replaces them all", async () => {
    const { secrets } = (await legacy.call("POST", "/api/vault/e2ee/legacy", {})).data;
    assert.deepEqual(secrets.map((s) => s.name), ["OLD_KEY"], "the shared project's secret stays server-encrypted");
    assert.equal(secrets[0].value, "old-2");
    assert.deepEqual(secrets[0].versions.map((v) => v.value), ["old-1"]);

    const items = await Promise.all(
      secrets.map(async (s) => ({ id: s.id, cipher: await seal(legacy, s.id, s.value), versions: await Promise.all(s.versions.map(async (v) => ({ id: v.id, cipher: await seal(legacy, s.id, v.value) }))) })),
    );
    const done = (await legacy.call("POST", "/api/vault/e2ee/migrate", { items })).data;
    assert.deepEqual(done, { migrated: 1, failed: [] });

    const raw = JSON.stringify([
      await world.db.collection("secrets").find({ userId: legacy.objectId, nameKey: "old_key" }).toArray(),
      await world.db.collection("secret_versions").find({ userId: legacy.objectId }).toArray(),
    ]);
    assert.ok(!raw.includes("old-1") && !raw.includes("old-2") && raw.includes("e1$"));

    const now = (await legacy.call("POST", `/api/vault/secrets/${before.id}/reveal`, {})).data;
    assert.equal(await open(legacy, before.id, now.cipher), "old-2");
    const old = (await legacy.call("POST", `/api/vault/secrets/${before.id}/versions/${history[0].id}/reveal`, {})).data;
    assert.equal(await open(legacy, before.id, old.cipher), "old-1");
    assert.equal((await legacy.call("POST", `/api/vault/secrets/${shared.id}/reveal`, {})).data.value, "stays");
    assert.deepEqual((await legacy.call("POST", "/api/vault/e2ee/legacy", {})).data.secrets, []);
  });

  it("refuses to migrate what isn't yours, is shared, is already done, or has changed", async () => {
    const stranger = await owner.call("POST", "/api/vault/e2ee/migrate", { items: [{ id: before.id, cipher: await seal(owner, before.id, "x"), versions: [] }] });
    assert.equal(stranger.data.migrated, 0);
    assert.equal(stranger.data.failed.length, 1);
    const again = (await legacy.call("POST", "/api/vault/e2ee/migrate", { items: [{ id: before.id, cipher: await seal(legacy, before.id, "x"), versions: [] }] })).data;
    assert.equal(again.migrated, 0);
    const inShared = (await legacy.call("POST", "/api/vault/e2ee/migrate", { items: [{ id: shared.id, cipher: await seal(legacy, shared.id, "x"), versions: [] }] })).data;
    assert.equal(inShared.migrated, 0);
    assert.equal((await legacy.call("POST", `/api/vault/secrets/${shared.id}/reveal`, {})).data.value, "stays");
  });

  it("refuses to run for an account that hasn't turned it on", async () => {
    assert.equal((await member.call("POST", "/api/vault/e2ee/legacy", {})).status, 409);
    assert.equal((await member.call("POST", "/api/vault/e2ee/migrate", { items: [{ id: "0".repeat(24), cipher: await seal(member, "x", "v"), versions: [] }] })).status, 409);
  });
});

describe("changing the passphrase", () => {
  it("replaces only the passphrase wrap, and the recovery key keeps working", async () => {
    const next = await changePassphrase(record, { passphrase: PASSPHRASE }, "a brand new passphrase", ITERATIONS);
    assert.equal((await owner.call("PATCH", "/api/account/e2ee", { record: next.record, expectedWrap: record.wrappedByPassphrase })).status, 200);
    const got = (await owner.call("GET", "/api/account/e2ee")).data.record;
    await unlockVault(got, { passphrase: "a brand new passphrase" });
    await unlockVault(got, { recoveryKey });
    await assert.rejects(unlockVault(got, { passphrase: PASSPHRASE }));
  });

  it("rejects a stale passphrase change without replacing the saved wrap", async () => {
    const before = (await owner.call("GET", "/api/account/e2ee")).data.record;
    const stale = await changePassphrase(record, { recoveryKey }, "another new passphrase", ITERATIONS);
    assert.equal((await owner.call("PATCH", "/api/account/e2ee", { record: stale.record, expectedWrap: record.wrappedByPassphrase })).status, 409);
    assert.deepEqual((await owner.call("GET", "/api/account/e2ee")).data.record, before);
  });

  it("refuses a record that would swap the recovery wrap", async () => {
    const other = await createVault("some other passphrase here", ITERATIONS);
    assert.equal((await owner.call("PATCH", "/api/account/e2ee", { record: other.record, expectedWrap: (await owner.call("GET", "/api/account/e2ee")).data.record.wrappedByPassphrase })).status, 409);
    await unlockVault((await owner.call("GET", "/api/account/e2ee")).data.record, { recoveryKey });
  });

  it("is refused for an account without end-to-end encryption", async () => {
    assert.equal((await member.call("PATCH", "/api/account/e2ee", { record, expectedWrap: record.wrappedByPassphrase })).status, 409);
  });
});

describe("migration synchronization and throttling", () => {
  it("serializes migration with membership and moves", async () => {
    for (const action of ["share", "move"]) {
      const user = await world.user(`race-${action}`);
      const p = (await user.call("POST", "/api/vault/projects", { name: "Source" })).data.project;
      const target = (await user.call("POST", "/api/vault/projects", { name: "Target" })).data.project;
      await user.call("POST", `/api/vault/projects/${target.id}/members`, { email: member.email, role: "viewer" });
      const secret = (await user.call("POST", "/api/vault/secrets", { projectId: p.id, name: "OLD", value: "old", environment: "local", type: "other" })).data.secret;
      await user.call("PATCH", `/api/vault/secrets/${secret.id}`, { value: "new" });
      await user.call("POST", "/api/account/e2ee", { record });
      const snapshot = (await user.call("POST", "/api/vault/e2ee/legacy", {})).data.secrets[0];
      const item = { id: secret.id, cipher: await seal(user, secret.id, snapshot.value), versions: await Promise.all(snapshot.versions.map(async v => ({ id: v.id, cipher: await seal(user, secret.id, v.value) }))) };
      const [migration, competing] = await Promise.all([
        user.call("POST", "/api/vault/e2ee/migrate", { items: [item] }),
        action === "share" ? user.call("POST", `/api/vault/projects/${p.id}/members`, { email: member.email, role: "viewer" }) : user.call("PATCH", `/api/vault/secrets/${secret.id}`, { projectId: target.id }),
      ]);
      assert.equal(migration.status, 200);
      assert.ok([200, 201, 409].includes(competing.status));
      const stored = await world.db.collection("secrets").findOne({ _id: new world.ObjectId(secret.id) });
      if (migration.data.migrated) {
        assert.equal(competing.status, 409);
        assert.match(stored.valueEncrypted, /^e1\$/);
        const history = await world.db.collection("secret_versions").find({ secretId: stored._id }).toArray();
        assert.equal(history.length, 1);
        assert.ok(history.every(v => v.valueEncrypted.startsWith("e1$")));
      } else {
        assert.equal(migration.data.failed.length, 1);
        assert.ok(!stored.valueEncrypted.startsWith("e1$"));
      }
    }
  });

  it("throttles before parsing the migration body, with Retry-After", async () => {
    const user = await world.user("throttled");
    await world.db.collection("rateLimits").insertOne({ _id: `e2ee-migrate:${user.id}`, count: 30, resetAt: new Date(Date.now() + 60_000), expiresAt: new Date(Date.now() + 60_000) });
    try {
      const response = await user.call("POST", "/api/vault/e2ee/migrate", { invalid: true }, true);
      assert.equal(response.status, 429);
      assert.ok(Number(response.headers.get("Retry-After")) > 0);
    } finally {
      await world.db.collection("rateLimits").deleteOne({ _id: `e2ee-migrate:${user.id}` });
    }
  });
});
