import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathOnly, redact } from "../../src/lib/redact.ts";

describe("redact", () => {
  it("removes email addresses", () => {
    assert.equal(redact("Recipient rejected: jane.doe@example.com (550)"), "Recipient rejected: [email] (550)");
  });

  it("removes passwords from connection strings", () => {
    assert.equal(redact("connect failed: mongodb+srv://admin:p4ss@cluster0.mongodb.net/db"), "connect failed: mongodb+srv://***@cluster0.mongodb.net/db");
    assert.ok(!redact("postgres://user:hunter2@host:5432/x").includes("hunter2"));
  });

  it("removes tokens from query strings", () => {
    assert.equal(redact("GET /verify-email?token=abc123&x=1"), "GET /verify-email?token=***&x=1");
    assert.ok(!redact("https://x.test/reset?code=SECRETCODE").includes("SECRETCODE"));
  });

  it("leaves ordinary text alone", () => {
    assert.equal(redact("TypeError: Cannot read properties of undefined (reading 'id')"), "TypeError: Cannot read properties of undefined (reading 'id')");
  });
});

describe("pathOnly", () => {
  it("drops the query string and the hash", () => {
    assert.equal(pathOnly("/reset-password?token=abc#top"), "/reset-password");
    assert.equal(pathOnly("/dashboard"), "/dashboard");
  });
});
