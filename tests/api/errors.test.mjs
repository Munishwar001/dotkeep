/**
 * Error pages and the error record on the Admin page. Needs a running server (see tests/helpers.mjs).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createWorld, client } from "../helpers.mjs";

let world, admin, regular;
// An address that matches no route renders our 404 page as plain HTML. A dashboard page calls notFound() while it is
// already streaming, so the status line (200) has gone out before that, and the page carries Next's 404 marker
// instead: the 404 page is then drawn in the browser.
const NOT_FOUND_PAGE = /<h1>Page not found<\/h1>/;
const NOT_FOUND_STREAMED = /NEXT_HTTP_ERROR_FALLBACK;404/;
const marker = `E2E-${Date.now().toString(36)}`;

before(async () => {
  world = await createWorld();
  [admin, regular] = [await world.user("admin", { role: "admin" }), await world.user("regular")];
});
after(async () => {
  await world.db.collection("server_errors").deleteMany({ fingerprint: { $regex: `^${marker}` } });
  await world.close();
});

describe("404 page", () => {
  it("is our own page, with a 404 status, for an address that doesn't exist", async () => {
    const response = await client()("GET", "/definitely-not-a-page", undefined, true);
    assert.equal(response.status, 404);
    const html = await response.text();
    assert.match(html, NOT_FOUND_PAGE);
    assert.match(html, /Go to dashboard/);
  });

  it("is what you get for a project that doesn't exist, or isn't yours", async () => {
    const theirs = (await admin.call("POST", "/api/vault/projects", { name: "NotYours", description: "" })).data.project;
    for (const id of ["0".repeat(24), theirs.id]) {
      // The status can be 200 here: the page streams, and by then the status line is already sent.
      const { html } = await regular.page(`/dashboard/projects/${id}`);
      assert.match(html, NOT_FOUND_STREAMED, `project ${id}`);
      assert.ok(!html.includes("NotYours"), "the other user's project name must not leak");
    }
  });

  it("is what a non-admin gets for the admin page", async () => {
    const { html } = await regular.page("/dashboard/admin");
    assert.match(html, NOT_FOUND_STREAMED);
    assert.ok(!html.includes("Server errors"));
  });
});

describe("error record on the admin page", () => {
  it("lists recorded errors with their count, route and id", async () => {
    const now = new Date();
    await world.db.collection("server_errors").insertOne({
      fingerprint: `${marker}-1`,
      name: "TypeError",
      message: `${marker} cannot read properties of undefined`,
      stack: "",
      source: "render",
      route: "/dashboard/vault",
      method: "GET",
      digest: "1234567890",
      count: 7,
      firstAt: now,
      lastAt: now,
    });
    const { status, html } = await admin.page("/dashboard/admin");
    assert.equal(status, 200);
    assert.match(html, /Server errors/);
    assert.ok(html.includes(`${marker} cannot read properties of undefined`));
    assert.match(html, /7×/);
    assert.ok(html.includes("/dashboard/vault"));
    assert.ok(html.includes("1234567890"));
  });
});
