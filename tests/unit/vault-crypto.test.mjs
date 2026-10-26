import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { before, describe, it } from "node:test";

let encryptSecret, decryptSecret;

before(async () => {
  // The key is read when the module loads, so set a throw-away one first.
  process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  ({ encryptSecret, decryptSecret } = await import("../../src/lib/vault-crypto.ts"));
});

describe("vault crypto (AES-256-GCM)", () => {
  it("decrypts what it encrypted", () => {
    const payload = encryptSecret("s3cret value\nwith lines", "user1:secret1");
    assert.equal(decryptSecret(payload, "user1:secret1"), "s3cret value\nwith lines");
  });

  it("uses a fresh IV, so the same value looks different each time", () => {
    assert.notEqual(encryptSecret("same", "ctx"), encryptSecret("same", "ctx"));
  });

  it("stores v1$iv$tag$data and never the plain value", () => {
    const payload = encryptSecret("plain-text-value", "ctx");
    assert.match(payload, /^v1\$[^$]+\$[^$]+\$[^$]*$/);
    assert.ok(!payload.includes("plain-text-value"));
  });

  it("refuses to decrypt under another context (another user or another secret)", () => {
    const payload = encryptSecret("value", "user1:secret1");
    assert.throws(() => decryptSecret(payload, "user1:secret2"));
    assert.throws(() => decryptSecret(payload, "user2:secret1"));
  });

  it("refuses tampered ciphertext", () => {
    const [version, iv, tag, data] = encryptSecret("value", "ctx").split("$");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    assert.throws(() => decryptSecret([version, iv, tag, flipped.toString("base64")].join("$"), "ctx"));
  });

  it("refuses unsupported formats", () => {
    assert.throws(() => decryptSecret("v2$a$b$c", "ctx"), /Unsupported/);
    assert.throws(() => decryptSecret("garbage", "ctx"), /Unsupported/);
  });

  it("refuses a key that isn't 32 bytes", () => {
    const original = process.env.VAULT_ENCRYPTION_KEY;
    process.env.VAULT_ENCRYPTION_KEY = Buffer.from("too short").toString("base64");
    try {
      assert.throws(() => encryptSecret("x", "ctx"), /32 bytes/);
    } finally {
      process.env.VAULT_ENCRYPTION_KEY = original;
    }
  });
});
