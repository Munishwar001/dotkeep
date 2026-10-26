import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { buildAuthorizeUrl, newOAuthAttempt, parseOAuthCookie, safeEqual } from "../../src/lib/google-oauth.ts";

describe("google oauth helpers", () => {
  it("round-trips the state and verifier through the cookie value", () => {
    const attempt = newOAuthAttempt();
    assert.deepEqual(parseOAuthCookie(attempt.cookieValue), { state: attempt.state, verifier: attempt.verifier });
  });

  it("rejects missing or malformed cookies", () => {
    assert.equal(parseOAuthCookie(undefined), null);
    assert.equal(parseOAuthCookie(""), null);
    assert.equal(parseOAuthCookie("onlystate"), null);
    assert.equal(parseOAuthCookie("a.b.c"), null);
  });

  it("makes a different state and verifier every time", () => {
    const a = newOAuthAttempt();
    const b = newOAuthAttempt();
    assert.notEqual(a.state, b.state);
    assert.notEqual(a.verifier, b.verifier);
  });

  it("compares strings safely", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("abc", "abcd"), false);
  });

  it("builds an authorize URL with PKCE and the verifier's S256 challenge, never the verifier itself", () => {
    process.env.GOOGLE_CLIENT_ID = "client-123";
    const { state, verifier } = newOAuthAttempt();
    const url = new URL(buildAuthorizeUrl(state, verifier, "https://dotkeep.example/api/auth/google/callback"));
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(url.searchParams.get("client_id"), "client-123");
    assert.equal(url.searchParams.get("redirect_uri"), "https://dotkeep.example/api/auth/google/callback");
    assert.equal(url.searchParams.get("state"), state);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(verifier).digest("base64url"));
    assert.ok(!url.toString().includes(verifier));
  });
});
