/**
 * Visitor pages (landing, login, signup) send someone who is already signed in to the dashboard. Needs a running
 * server (see tests/helpers.mjs). The redirect happens while the page streams, so it shows up as a <meta refresh> tag.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { client, createWorld } from "../helpers.mjs";

const PAGES = ["/", "/login", "/signup"];
const REDIRECT_TO_DASHBOARD = /http-equiv="refresh"[^>]*content="[^"]*url=\/dashboard"/;

let world, user;

before(async () => {
  world = await createWorld();
  user = await world.user("redirect");
});
after(() => world.close());

describe("visitor pages", () => {
  for (const path of PAGES) {
    it(`${path} sends a signed-in user to the dashboard`, async () => {
      const { status, html } = await user.page(path);
      assert.equal(status, 200);
      assert.match(html, REDIRECT_TO_DASHBOARD);
    });

    it(`${path} stays put for a visitor with no session`, async () => {
      const response = await client()("GET", path, undefined, true);
      assert.equal(response.status, 200);
      assert.doesNotMatch(await response.text(), REDIRECT_TO_DASHBOARD);
    });

    it(`${path} stays put when the session cookie is stale (no redirect loop)`, async () => {
      const stale = client("dotkeep_session=not-a-real-session");
      const html = await stale("GET", path, undefined, true).then((r) => r.text());
      assert.doesNotMatch(html, REDIRECT_TO_DASHBOARD);
    });
  }
});
