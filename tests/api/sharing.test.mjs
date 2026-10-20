/**
 * Project sharing: owner, editor, viewer and outsider. Needs `npm run dev` running (see tests/helpers.mjs).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createWorld } from "../helpers.mjs";

let world, owner, editor, viewer, outsider;
let shared, second, token;

before(async () => {
  world = await createWorld();
  [owner, editor, viewer, outsider] = [await world.user("owner"), await world.user("editor"), await world.user("viewer"), await world.user("outsider")];
  shared = (await owner.call("POST", "/api/vault/projects", { name: "Shared", description: "" })).data.project;
  second = (await owner.call("POST", "/api/vault/projects", { name: "Second", description: "" })).data.project;
  token = (await owner.call("POST", "/api/vault/secrets", { projectId: shared.id, name: "TOKEN", environment: "production", type: "api_key", value: "s3cret" })).data.secret;
});
after(() => world.close());

const invite = (who, role) => owner.call("POST", `/api/vault/projects/${shared.id}/members`, { email: who.email, role });
const reveal = (who, id = token.id) => who.call("POST", `/api/vault/secrets/${id}/reveal`, {});

describe("before anything is shared", () => {
  it("others can't see the project or its secrets", async () => {
    assert.equal((await reveal(editor)).status, 404);
    assert.equal((await editor.call("GET", "/api/vault/projects")).data.projects.length, 0);
    assert.equal((await editor.call("GET", "/api/vault/secrets")).data.secrets.length, 0);
  });
});

describe("inviting", () => {
  it("rejects unknown emails, yourself and bad roles", async () => {
    assert.equal((await owner.call("POST", `/api/vault/projects/${shared.id}/members`, { email: "nobody@example.com", role: "editor" })).status, 404);
    assert.equal((await invite(owner, "editor")).status, 422);
    assert.equal((await invite(editor, "admin")).status, 400);
    assert.equal((await owner.call("POST", `/api/vault/projects/${shared.id}/members`, { email: "not-an-email", role: "editor" })).status, 400);
  });

  it("refuses an account whose email isn't verified", async () => {
    const unverified = await world.user("unverified");
    await world.db.collection("users").updateOne({ _id: unverified.objectId }, { $set: { emailVerified: false } });
    assert.equal((await invite(unverified, "viewer")).status, 404);
  });

  it("shares with an editor and a viewer, and lists them with the owner first", async () => {
    assert.equal((await invite(editor, "editor")).status, 201);
    assert.equal((await invite(viewer, "viewer")).status, 201);
    const r = await owner.call("GET", `/api/vault/projects/${shared.id}/members`);
    assert.deepEqual(r.data.members.map((m) => m.role), ["owner", "editor", "viewer"]);
  });

  it("only the owner can see or change who has access", async () => {
    assert.equal((await editor.call("GET", `/api/vault/projects/${shared.id}/members`)).status, 403);
    assert.equal((await outsider.call("GET", `/api/vault/projects/${shared.id}/members`)).status, 404);
    assert.equal((await editor.call("POST", `/api/vault/projects/${shared.id}/members`, { email: outsider.email, role: "viewer" })).status, 403);
    assert.equal((await editor.call("DELETE", `/api/vault/projects/${shared.id}/members/${viewer.id}`)).status, 403);
  });
});

describe("editor", () => {
  let fromEditor;

  it("sees the project with their role and the owner's name", async () => {
    const project = (await editor.call("GET", "/api/vault/projects")).data.projects.find((p) => p.id === shared.id);
    assert.equal(project.role, "editor");
    assert.equal(project.ownerName, owner.name);
    assert.equal(project.secretCount, 1);
    assert.ok((await editor.call("GET", "/api/vault/secrets")).data.secrets.some((s) => s.id === token.id));
  });

  it("reveals values and creates secrets that belong to the owner", async () => {
    assert.equal((await reveal(editor)).data.value, "s3cret");
    const r = await editor.call("POST", "/api/vault/secrets", { projectId: shared.id, name: "FROM_EDITOR", environment: "local", type: "other", value: "e-value" });
    assert.equal(r.status, 201);
    fromEditor = r.data.secret;
    const doc = await world.db.collection("secrets").findOne({ _id: new world.ObjectId(fromEditor.id) });
    assert.equal(doc.userId.toString(), owner.id);
    assert.equal((await reveal(owner, fromEditor.id)).data.value, "e-value");
  });

  it("edits, imports, and deletes in bulk", async () => {
    assert.equal((await editor.call("PATCH", `/api/vault/secrets/${fromEditor.id}`, { value: "e-value-2" })).status, 200);
    const imported = await editor.call("POST", "/api/vault/import", { projectId: shared.id, environment: "staging", content: "IMPORTED=1\nIMPORTED2=2" });
    assert.equal(imported.data.created, 2);
    const tmp = (await editor.call("POST", "/api/vault/secrets", { projectId: shared.id, name: "TMP", environment: "local", type: "other", value: "x" })).data.secret;
    assert.equal((await editor.call("POST", "/api/vault/secrets/bulk", { action: "delete", ids: [tmp.id] })).data.deleted, 1);
  });

  it("can't rename or delete the project", async () => {
    assert.equal((await editor.call("PATCH", `/api/vault/projects/${shared.id}`, { name: "Hacked", description: "" })).status, 403);
    assert.equal((await editor.call("DELETE", `/api/vault/projects/${shared.id}`)).status, 403);
  });

  it("can't move a secret into a project they can't write to, or into another owner's project", async () => {
    assert.equal((await editor.call("PATCH", `/api/vault/secrets/${fromEditor.id}`, { projectId: second.id })).status, 404);

    const theirs = (await editor.call("POST", "/api/vault/projects", { name: "EditorsOwn", description: "" })).data.project;
    const refused = await editor.call("PATCH", `/api/vault/secrets/${fromEditor.id}`, { projectId: theirs.id });
    assert.equal(refused.status, 404);
    assert.match(refused.data.error, /same owner/);
    assert.equal((await editor.call("POST", "/api/vault/secrets/bulk", { action: "update", ids: [fromEditor.id], projectId: theirs.id })).status, 400);
  });

  it("can move a secret between two projects of the same owner once both are shared", async () => {
    await owner.call("POST", `/api/vault/projects/${second.id}/members`, { email: editor.email, role: "editor" });
    const r = await editor.call("PATCH", `/api/vault/secrets/${fromEditor.id}`, { projectId: second.id });
    assert.equal(r.status, 200);
    assert.equal((await reveal(editor, fromEditor.id)).data.value, "e-value-2");
  });
});

describe("viewer", () => {
  it("can look: reveal, export, read history", async () => {
    assert.equal((await reveal(viewer)).data.value, "s3cret");
    const exported = await viewer.call("POST", "/api/vault/export", { projectId: shared.id, environment: "production" });
    assert.match(exported.data.content, /TOKEN=s3cret/);
    assert.equal((await viewer.call("GET", `/api/vault/secrets/${token.id}/versions`)).status, 200);
  });

  it("can't change anything (403)", async () => {
    const attempts = [
      viewer.call("POST", "/api/vault/secrets", { projectId: shared.id, name: "NOPE", environment: "local", type: "other", value: "x" }),
      viewer.call("PATCH", `/api/vault/secrets/${token.id}`, { value: "hijack" }),
      viewer.call("DELETE", `/api/vault/secrets/${token.id}`),
      viewer.call("POST", "/api/vault/import", { projectId: shared.id, environment: "local", content: "A=1" }),
      viewer.call("PATCH", `/api/vault/projects/${shared.id}`, { name: "x", description: "" }),
    ];
    for (const r of await Promise.all(attempts)) assert.equal(r.status, 403);
  });

  it("can't restore a version, but can read an old value", async () => {
    await owner.call("PATCH", `/api/vault/secrets/${token.id}`, { value: "s3cret-v2" });
    const [version] = (await viewer.call("GET", `/api/vault/secrets/${token.id}/versions`)).data.versions;
    assert.equal((await viewer.call("POST", `/api/vault/secrets/${token.id}/versions/${version.id}/restore`, {})).status, 403);
    assert.equal((await viewer.call("POST", `/api/vault/secrets/${token.id}/versions/${version.id}/reveal`, {})).data.value, "s3cret");
  });

  it("bulk actions silently skip what they can't change", async () => {
    assert.equal((await viewer.call("POST", "/api/vault/secrets/bulk", { action: "delete", ids: [token.id] })).data.deleted, 0);
    assert.equal((await viewer.call("POST", "/api/vault/secrets/bulk", { action: "update", ids: [token.id], type: "other" })).data.updated, 0);
  });
});

describe("outsider", () => {
  it("gets 404 for everything", async () => {
    const [version] = (await owner.call("GET", `/api/vault/secrets/${token.id}/versions`)).data.versions;
    const attempts = [
      reveal(outsider),
      outsider.call("GET", `/api/vault/secrets/${token.id}/versions`),
      outsider.call("POST", `/api/vault/secrets/${token.id}/versions/${version.id}/reveal`, {}),
      outsider.call("PATCH", `/api/vault/secrets/${token.id}`, { value: "x" }),
      outsider.call("DELETE", `/api/vault/secrets/${token.id}`),
      outsider.call("POST", "/api/vault/export", { projectId: shared.id, environment: "production" }),
      outsider.call("POST", "/api/vault/import", { projectId: shared.id, environment: "local", content: "A=1" }),
      outsider.call("POST", "/api/vault/secrets", { projectId: shared.id, name: "X", environment: "local", type: "other", value: "x" }),
      outsider.call("PATCH", `/api/vault/projects/${shared.id}`, { name: "x", description: "" }),
      outsider.call("DELETE", `/api/vault/projects/${shared.id}/members/${editor.id}`),
    ];
    for (const r of await Promise.all(attempts)) assert.equal(r.status, 404);
    assert.equal((await outsider.call("GET", `/api/vault/secrets/${token.id}/activity`)).data.events.length, 0);
  });
});

describe("audit log with sharing", () => {
  it("shows who did what, to everyone who can open the project", async () => {
    const asViewer = (await viewer.call("GET", `/api/vault/secrets/${token.id}/activity`)).data.events;
    assert.ok(asViewer.some((e) => e.action === "revealed" && e.actorName === editor.name), "the editor's reveal is visible to the viewer");
    const inSecond = (await owner.call("GET", "/api/vault/secrets?projectId=" + second.id)).data.secrets[0];
    const asOwner = (await owner.call("GET", `/api/vault/secrets/${inSecond.id}/activity`)).data.events;
    for (const action of ["created", "value_changed", "moved"]) {
      assert.ok(asOwner.some((e) => e.action === action && e.actorName === editor.name), `missing ${action} by the editor`);
    }
  });
});

describe("roles change and access ends", () => {
  it("promotes a viewer to editor", async () => {
    assert.equal((await owner.call("PATCH", `/api/vault/projects/${shared.id}/members/${viewer.id}`, { role: "editor" })).status, 200);
    const r = await viewer.call("POST", "/api/vault/secrets", { projectId: shared.id, name: "NOW_OK", environment: "local", type: "other", value: "x" });
    assert.equal(r.status, 201);
    assert.equal((await owner.call("PATCH", `/api/vault/projects/${shared.id}/members/${viewer.id}`, { role: "boss" })).status, 400);
  });

  it("lets a member leave on their own", async () => {
    assert.equal((await viewer.call("DELETE", `/api/vault/projects/${shared.id}/members/${viewer.id}`)).status, 200);
    assert.equal((await reveal(viewer)).status, 404);
  });

  it("ends access at once when the owner removes someone", async () => {
    assert.equal((await owner.call("DELETE", `/api/vault/projects/${shared.id}/members/${editor.id}`)).status, 200);
    assert.equal((await reveal(editor)).status, 404);
  });

  it("deleting the project clears its sharing", async () => {
    await invite(viewer, "viewer");
    assert.equal((await owner.call("DELETE", `/api/vault/projects/${shared.id}`)).status, 200);
    assert.equal(await world.db.collection("project_members").countDocuments({ projectId: new world.ObjectId(shared.id) }), 0);
  });
});

describe("pages", () => {
  it("render for the owner and for someone the project is shared with", async () => {
    const page = (await owner.call("POST", "/api/vault/projects", { name: "PageCheck", description: "" })).data.project;
    await owner.call("POST", `/api/vault/projects/${page.id}/members`, { email: viewer.email, role: "viewer" });
    for (const who of [owner, viewer]) {
      for (const path of [`/dashboard/projects/${page.id}`, "/dashboard/projects", "/dashboard/vault", "/dashboard/activity"]) {
        assert.equal((await who.page(path)).status, 200, `${path} for ${who.name}`);
      }
    }
    assert.match((await viewer.page(`/dashboard/projects/${page.id}`)).html, /Shared with you by/);
  });
});
