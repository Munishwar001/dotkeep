/**
 * Admin controls: block, unblock, delete, and email masking. Needs `npm run dev` running (see tests/helpers.mjs).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createWorld } from "../helpers.mjs";

let world, admin, otherAdmin, regular;

before(async () => {
  world = await createWorld();
  [admin, otherAdmin, regular] = [await world.user("admin", { role: "admin" }), await world.user("admin2", { role: "admin" }), await world.user("regular")];
});
after(() => world.close());

const page = async (who, path = "/dashboard/admin") => (await who.page(path)).html;

describe("who may use the admin APIs", () => {
  it("answers 404 to anyone who isn't an admin", async () => {
    const victim = await world.user("victim");
    assert.equal((await regular.call("PATCH", `/api/admin/users/${victim.id}`, { blocked: true })).status, 404);
    assert.equal((await regular.call("DELETE", `/api/admin/users/${victim.id}`)).status, 404);
    assert.equal((await regular.call("PATCH", "/api/admin/preferences", { maskEmails: true })).status, 404);
    assert.equal(await world.db.collection("users").countDocuments({ _id: victim.objectId, blockedAt: { $exists: true } }), 0);
  });
});

describe("guards", () => {
  it("won't act on yourself or on another admin", async () => {
    for (const target of [admin, otherAdmin]) {
      assert.equal((await admin.call("PATCH", `/api/admin/users/${target.id}`, { blocked: true })).status, 403);
      assert.equal((await admin.call("DELETE", `/api/admin/users/${target.id}`)).status, 403);
    }
    assert.equal(await world.db.collection("users").countDocuments({ _id: { $in: [admin.objectId, otherAdmin.objectId] } }), 2);
  });

  it("answers 404 for a user that isn't there and 400 for a bad body", async () => {
    assert.equal((await admin.call("PATCH", `/api/admin/users/${"0".repeat(24)}`, { blocked: true })).status, 404);
    assert.equal((await admin.call("PATCH", `/api/admin/users/${regular.id}`, { blocked: "yes" })).status, 400);
    assert.equal((await admin.call("PATCH", "/api/admin/users/not-an-id", { blocked: true })).status, 404);
  });
});

describe("blocking", () => {
  let member; // a real account made through signup, so it can log in

  before(async () => {
    member = await world.signedUp("member");
    assert.equal((await member.login()).status, 200);
  });

  it("logs the user out at once and ends their sessions", async () => {
    assert.equal((await member.call("GET", "/api/vault/projects")).status, 200);
    const r = await admin.call("PATCH", `/api/admin/users/${member.id}`, { blocked: true });
    assert.equal(r.status, 200);
    assert.equal((await member.call("GET", "/api/vault/projects")).status, 401);
    assert.equal(await world.db.collection("sessions").countDocuments({ userId: member.objectId }), 0);
  });

  it("refuses a blocked login only after the right password, so strangers learn nothing", async () => {
    const right = await member.login();
    assert.equal(right.status, 403);
    assert.equal(right.data.code, "account_blocked");
    const wrong = await member.call("POST", "/api/auth/login", { email: member.email, password: "Wrong-password-123" });
    assert.equal(wrong.status, 401);
  });

  it("keeps the user's data and shows a Blocked badge", async () => {
    assert.equal(await world.db.collection("users").countDocuments({ _id: member.objectId }), 1);
    assert.match(await page(admin), /Blocked/);
  });

  it("lets them log in again after an unblock", async () => {
    assert.equal((await admin.call("PATCH", `/api/admin/users/${member.id}`, { blocked: false })).status, 200);
    assert.equal((await member.login()).status, 200);
  });
});

describe("deleting", () => {
  it("removes the user, their projects, secrets and shares, and kills their session", async () => {
    const doomed = await world.user("doomed");
    const friend = await world.user("friend");
    const project = (await doomed.call("POST", "/api/vault/projects", { name: "Doomed", description: "" })).data.project;
    await doomed.call("POST", "/api/vault/secrets", { projectId: project.id, name: "K", environment: "local", type: "other", value: "v" });
    await doomed.call("POST", `/api/vault/projects/${project.id}/members`, { email: friend.email, role: "viewer" });
    // and the other way round: doomed is a member of someone else's project
    const friendsProject = (await friend.call("POST", "/api/vault/projects", { name: "Friends", description: "" })).data.project;
    await friend.call("POST", `/api/vault/projects/${friendsProject.id}/members`, { email: doomed.email, role: "editor" });

    assert.equal((await admin.call("DELETE", `/api/admin/users/${doomed.id}`)).status, 200);

    const db = world.db;
    assert.equal(await db.collection("users").countDocuments({ _id: doomed.objectId }), 0);
    assert.equal(await db.collection("projects").countDocuments({ userId: doomed.objectId }), 0);
    assert.equal(await db.collection("secrets").countDocuments({ userId: doomed.objectId }), 0);
    assert.equal(await db.collection("project_members").countDocuments({ $or: [{ ownerId: doomed.objectId }, { userId: doomed.objectId }] }), 0);
    assert.equal((await doomed.call("GET", "/api/vault/projects")).status, 401);
    // the friend and their project are untouched
    assert.equal((await friend.call("GET", "/api/vault/projects")).data.projects.length, 1);
    assert.equal((await admin.call("DELETE", `/api/admin/users/${doomed.id}`)).status, 404);
  });
});

describe("email masking", () => {
  it("shows real emails by default and finds users by email", async () => {
    const html = await page(admin, `/dashboard/admin?q=${encodeURIComponent(regular.email)}`);
    assert.ok(html.includes(regular.email));
  });

  it("rejects a bad value", async () => {
    assert.equal((await admin.call("PATCH", "/api/admin/preferences", { maskEmails: "x" })).status, 400);
  });

  it("masks other users' emails on the server when switched on", async () => {
    assert.equal((await admin.call("PATCH", "/api/admin/preferences", { maskEmails: true })).status, 200);
    const html = await page(admin);
    assert.ok(!html.includes(regular.email), "the real email must not be in the page at all");
    assert.ok(!html.includes(otherAdmin.email));
    assert.match(html, /e\*\*\*@e\*\*\*\.com/);
  });

  it("then searches by name only, so an email can't be found by guessing", async () => {
    const byEmail = await page(admin, `/dashboard/admin?q=${encodeURIComponent(regular.email)}`);
    assert.match(byEmail, /No users match/);
    const byName = await page(admin, `/dashboard/admin?q=${encodeURIComponent(regular.name)}`);
    assert.ok(byName.includes(regular.name));
    assert.ok(!byName.includes(regular.email));
  });

  it("is each admin's own setting, and can be switched off again", async () => {
    assert.ok((await page(otherAdmin)).includes(regular.email), "the other admin still sees real emails");
    assert.equal((await admin.call("PATCH", "/api/admin/preferences", { maskEmails: false })).status, 200);
    assert.ok((await page(admin)).includes(regular.email));
  });
});
