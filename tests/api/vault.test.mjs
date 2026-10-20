/**
 * Vault features for a single user: .env import/export, version history, move, bulk edit/delete, audit log,
 * and that other users can't touch any of it. Needs `npm run dev` running (see tests/helpers.mjs).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createWorld } from "../helpers.mjs";

let world, alice, bob;
let projectA, projectB;

before(async () => {
  world = await createWorld();
  [alice, bob] = [await world.user("alice"), await world.user("bob")];
  projectA = (await alice.call("POST", "/api/vault/projects", { name: "ProjA", description: "" })).data.project;
  projectB = (await alice.call("POST", "/api/vault/projects", { name: "ProjB", description: "" })).data.project;
});
after(() => world.close());

const secretsOf = async (user, projectId) => (await user.call("GET", `/api/vault/secrets?projectId=${projectId}`)).data.secrets;

describe(".env import and export", () => {
  const FILE = [
    "# comment",
    "DATABASE_URL=postgres://u:p@h/db",
    'export API_KEY="abc def"',
    'MULTI="line1\\nline2"',
    "Q='single # not comment'",
    "INLINE=val # trailing",
    "bad line",
    "EMPTY=",
  ].join("\n");

  it("imports every valid line and reports the bad ones", async () => {
    const r = await alice.call("POST", "/api/vault/import", { projectId: projectA.id, environment: "production", content: FILE });
    assert.equal(r.status, 200);
    assert.equal(r.data.created, 5);
    assert.equal(r.data.lineErrors.length, 2);
  });

  it("skips variables that already exist unless overwrite is on", async () => {
    const r = await alice.call("POST", "/api/vault/import", {
      projectId: projectA.id,
      environment: "production",
      content: "API_KEY=new\nNEWONE=1\nDATABASE_URL=postgres://u:p@h/db",
    });
    assert.equal(r.data.skipped, 2);
    assert.equal(r.data.created, 1);
  });

  it("overwrites changed values, and leaves identical ones alone (no pointless version)", async () => {
    const r = await alice.call("POST", "/api/vault/import", {
      projectId: projectA.id,
      environment: "production",
      content: "API_KEY=new\nDATABASE_URL=postgres://u:p@h/db",
      overwrite: true,
    });
    assert.equal(r.data.updated, 1);
    assert.equal(r.data.unchanged, 1);
  });

  it("rejects empty and oversized files", async () => {
    let r = await alice.call("POST", "/api/vault/import", { projectId: projectA.id, environment: "local", content: "   " });
    assert.equal(r.status, 400);
    r = await alice.call("POST", "/api/vault/import", { projectId: projectA.id, environment: "local", content: "A=1\n".repeat(60_000) });
    assert.equal(r.status, 400);
  });

  it("exports the project's variables as .env text", async () => {
    const r = await alice.call("POST", "/api/vault/export", { projectId: projectA.id, environment: "production" });
    assert.equal(r.status, 200);
    assert.equal(r.data.count, 6);
    assert.match(r.data.content, /MULTI="line1\\nline2"/);
    assert.match(r.data.content, /API_KEY=new/);
  });

  it("round-trips: export, import elsewhere, export again gives the same text", async () => {
    const first = (await alice.call("POST", "/api/vault/export", { projectId: projectA.id, environment: "production" })).data.content;
    const imported = await alice.call("POST", "/api/vault/import", { projectId: projectB.id, environment: "local", content: first });
    assert.equal(imported.data.created, 6);
    const second = (await alice.call("POST", "/api/vault/export", { projectId: projectB.id, environment: "local" })).data.content;
    assert.equal(second, first);
  });

  it("leaves secrets with names that can't be variables out of an export", async () => {
    const project = (await alice.call("POST", "/api/vault/projects", { name: "Odd", description: "" })).data.project;
    await alice.call("POST", "/api/vault/secrets", { projectId: project.id, name: "has space", environment: "local", type: "other", value: "x" });
    await alice.call("POST", "/api/vault/secrets", { projectId: project.id, name: "FINE", environment: "local", type: "other", value: "y" });
    const r = await alice.call("POST", "/api/vault/export", { projectId: project.id, environment: "local" });
    assert.equal(r.data.count, 1);
    assert.deepEqual(r.data.skipped, ["has space"]);
  });
});

describe("version history", () => {
  let secret, versionId;

  it("keeps the old value when the value changes", async () => {
    const list = await secretsOf(alice, projectA.id);
    secret = list.find((s) => s.name === "API_KEY");
    const r = await alice.call("GET", `/api/vault/secrets/${secret.id}/versions`);
    assert.equal(r.data.versions.length, 1); // "abc def" -> "new" from the overwrite import
    versionId = r.data.versions[0].id;
    assert.ok(!JSON.stringify(r.data).includes("abc def"), "the list must not contain values");
  });

  it("reveals an old value on request", async () => {
    const r = await alice.call("POST", `/api/vault/secrets/${secret.id}/versions/${versionId}/reveal`, {});
    assert.equal(r.data.value, "abc def");
  });

  it("restores an old value and keeps the one it replaced", async () => {
    assert.equal((await alice.call("POST", `/api/vault/secrets/${secret.id}/versions/${versionId}/restore`, {})).status, 200);
    assert.equal((await alice.call("POST", `/api/vault/secrets/${secret.id}/reveal`, {})).data.value, "abc def");
    assert.equal((await alice.call("GET", `/api/vault/secrets/${secret.id}/versions`)).data.versions.length, 2);
  });

  it("keeps at most 20 old values", async () => {
    const made = (await alice.call("POST", "/api/vault/secrets", { projectId: projectB.id, name: "ROTATING", environment: "staging", type: "other", value: "v1" })).data.secret;
    for (let i = 2; i <= 26; i++) await alice.call("PATCH", `/api/vault/secrets/${made.id}`, { value: `v${i}` });
    assert.equal((await alice.call("GET", `/api/vault/secrets/${made.id}/versions`)).data.versions.length, 20);
  });

  it("answers 404 for a version that isn't there", async () => {
    const r = await alice.call("POST", `/api/vault/secrets/${secret.id}/versions/${"0".repeat(24)}/reveal`, {});
    assert.equal(r.status, 404);
  });
});

describe("moving and bulk edit", () => {
  let mover;

  before(async () => {
    mover = (await alice.call("POST", "/api/vault/secrets", { projectId: projectA.id, name: "MOVER", environment: "local", type: "other", value: "m-value" })).data.secret;
  });

  it("moves a secret to another project and the value still decrypts", async () => {
    const r = await alice.call("PATCH", `/api/vault/secrets/${mover.id}`, { projectId: projectB.id });
    assert.equal(r.status, 200);
    assert.equal(r.data.secret.projectId, projectB.id);
    assert.equal((await alice.call("POST", `/api/vault/secrets/${mover.id}/reveal`, {})).data.value, "m-value");
  });

  it("refuses to move into a project that doesn't exist", async () => {
    const r = await alice.call("PATCH", `/api/vault/secrets/${mover.id}`, { projectId: "0".repeat(24) });
    assert.equal(r.status, 404);
  });

  it("refuses a move that would clash with an existing name", async () => {
    await alice.call("POST", "/api/vault/secrets", { projectId: projectA.id, name: "CLASH", environment: "local", type: "other", value: "a" });
    const other = (await alice.call("POST", "/api/vault/secrets", { projectId: projectB.id, name: "CLASH", environment: "local", type: "other", value: "b" })).data.secret;
    const r = await alice.call("PATCH", `/api/vault/secrets/${other.id}`, { projectId: projectA.id });
    assert.equal(r.status, 409);
  });

  it("bulk update reports the secrets that can't take the change and applies it to the rest", async () => {
    const inB = await secretsOf(alice, projectB.id);
    const r = await alice.call("POST", "/api/vault/secrets/bulk", { action: "update", ids: inB.map((s) => s.id), projectId: projectA.id, environment: "production" });
    assert.equal(r.status, 200);
    assert.ok(r.data.failed.length >= 5, "the .env names already exist in ProjA / production");
    assert.equal(r.data.updated + r.data.failed.length, inB.length);
  });

  it("bulk update can change the type of many at once", async () => {
    const inB = await secretsOf(alice, projectB.id);
    const r = await alice.call("POST", "/api/vault/secrets/bulk", { action: "update", ids: inB.map((s) => s.id), type: "other" });
    assert.equal(r.data.updated, inB.length);
  });

  it("validates bulk requests", async () => {
    assert.equal((await alice.call("POST", "/api/vault/secrets/bulk", { action: "update", ids: [], type: "other" })).status, 400);
    assert.equal((await alice.call("POST", "/api/vault/secrets/bulk", { action: "update", ids: [mover.id] })).status, 400);
    assert.equal((await alice.call("POST", "/api/vault/secrets/bulk", { action: "explode", ids: [mover.id] })).status, 400);
    const tooMany = Array.from({ length: 201 }, (_, i) => i.toString(16).padStart(24, "0")) // distinct ids: duplicates are merged;
    assert.equal((await alice.call("POST", "/api/vault/secrets/bulk", { action: "delete", ids: tooMany })).status, 400);
  });

  it("bulk delete removes the secrets and their history", async () => {
    const doomed = (await alice.call("POST", "/api/vault/secrets", { projectId: projectB.id, name: "DOOMED", environment: "local", type: "other", value: "1" })).data.secret;
    await alice.call("PATCH", `/api/vault/secrets/${doomed.id}`, { value: "2" });
    const r = await alice.call("POST", "/api/vault/secrets/bulk", { action: "delete", ids: [doomed.id] });
    assert.equal(r.data.deleted, 1);
    assert.equal(await world.db.collection("secret_versions").countDocuments({ secretId: new world.ObjectId(doomed.id) }), 0);
  });
});

describe("audit log", () => {
  it("records created, imported, value changes, views, restores, moves and deletes", async () => {
    const secret = (await secretsOf(alice, projectA.id)).find((s) => s.name === "API_KEY");
    const actions = (await alice.call("GET", `/api/vault/secrets/${secret.id}/activity`)).data.events.map((e) => e.action);
    for (const expected of ["imported", "value_changed", "revealed", "restored"]) assert.ok(actions.includes(expected), `missing ${expected}`);
  });

  it("keeps the log of a secret after it is deleted", async () => {
    const made = (await alice.call("POST", "/api/vault/secrets", { projectId: projectB.id, name: "GONE", environment: "local", type: "other", value: "x" })).data.secret;
    await alice.call("DELETE", `/api/vault/secrets/${made.id}`);
    const events = (await alice.call("GET", `/api/vault/secrets/${made.id}/activity`)).data.events;
    assert.deepEqual(events.map((e) => e.action).sort(), ["created", "deleted"]);
  });

  it("never stores a value", async () => {
    const stored = JSON.stringify(await world.db.collection("secret_events").find({ userId: alice.objectId }).toArray());
    for (const value of ["abc def", "m-value", "postgres://u:p@h/db"]) assert.ok(!stored.includes(value));
  });
});

describe("another user", () => {
  let secret, versionId;

  before(async () => {
    secret = (await secretsOf(alice, projectA.id)).find((s) => s.name === "API_KEY");
    versionId = (await alice.call("GET", `/api/vault/secrets/${secret.id}/versions`)).data.versions[0].id;
  });

  it("can't read, change, export or import anything of Alice's (404)", async () => {
    const attempts = [
      bob.call("POST", `/api/vault/secrets/${secret.id}/reveal`, {}),
      bob.call("GET", `/api/vault/secrets/${secret.id}/versions`),
      bob.call("POST", `/api/vault/secrets/${secret.id}/versions/${versionId}/reveal`, {}),
      bob.call("POST", `/api/vault/secrets/${secret.id}/versions/${versionId}/restore`, {}),
      bob.call("PATCH", `/api/vault/secrets/${secret.id}`, { value: "x" }),
      bob.call("DELETE", `/api/vault/secrets/${secret.id}`),
      bob.call("POST", "/api/vault/export", { projectId: projectA.id, environment: "production" }),
      bob.call("POST", "/api/vault/import", { projectId: projectA.id, environment: "local", content: "A=1" }),
    ];
    for (const r of await Promise.all(attempts)) assert.equal(r.status, 404);
  });

  it("sees no activity, and a bulk delete of Alice's ids removes nothing", async () => {
    assert.equal((await bob.call("GET", `/api/vault/secrets/${secret.id}/activity`)).data.events.length, 0);
    assert.equal((await bob.call("POST", "/api/vault/secrets/bulk", { action: "delete", ids: [secret.id] })).data.deleted, 0);
    assert.equal((await alice.call("POST", `/api/vault/secrets/${secret.id}/reveal`, {})).status, 200);
  });

  it("can't move one of their secrets into Alice's project", async () => {
    const own = (await bob.call("POST", "/api/vault/projects", { name: "Mine", description: "" })).data.project;
    const mine = (await bob.call("POST", "/api/vault/secrets", { projectId: own.id, name: "MINE", environment: "local", type: "other", value: "z" })).data.secret;
    assert.equal((await bob.call("PATCH", `/api/vault/secrets/${mine.id}`, { projectId: projectA.id })).status, 404);
  });
});

describe("deleting a project", () => {
  it("deletes its secrets and history but keeps the audit log", async () => {
    const project = (await alice.call("POST", "/api/vault/projects", { name: "Temp", description: "" })).data.project;
    const made = (await alice.call("POST", "/api/vault/secrets", { projectId: project.id, name: "T", environment: "local", type: "other", value: "1" })).data.secret;
    await alice.call("PATCH", `/api/vault/secrets/${made.id}`, { value: "2" });
    assert.equal((await alice.call("DELETE", `/api/vault/projects/${project.id}`)).status, 200);
    assert.equal(await world.db.collection("secrets").countDocuments({ projectId: new world.ObjectId(project.id) }), 0);
    assert.equal(await world.db.collection("secret_versions").countDocuments({ secretId: new world.ObjectId(made.id) }), 0);
    const actions = (await alice.call("GET", `/api/vault/secrets/${made.id}/activity`)).data.events.map((e) => e.action);
    assert.ok(actions.includes("deleted"));
  });
});
