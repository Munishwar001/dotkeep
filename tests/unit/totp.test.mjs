import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, looksLikeRecoveryCode, otpauthUri, verifyTotp } from "../../src/lib/totp.ts";

// RFC 6238 appendix B: the secret is the ASCII string "12345678901234567890" (base32 below).
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("verifyTotp", () => {
  it("matches the RFC 6238 test vectors (6-digit tail)", () => {
    assert.equal(verifyTotp(RFC_SECRET, "287082", -1, 59_000), 1);
    assert.equal(verifyTotp(RFC_SECRET, "081804", -1, 1_111_111_109_000), 37037036);
    assert.equal(verifyTotp(RFC_SECRET, "050471", -1, 1_111_111_111_000), 37037037);
  });

  it("accepts spaces and a dash in what was typed", () => {
    assert.equal(verifyTotp(RFC_SECRET, "287 082", -1, 59_000), 1);
    assert.equal(verifyTotp(RFC_SECRET, "287-082", -1, 59_000), 1);
  });

  it("forgives one step of clock drift but not more", () => {
    assert.equal(verifyTotp(RFC_SECRET, "287082", -1, 59_000 + 30_000), 1);
    assert.equal(verifyTotp(RFC_SECRET, "287082", -1, 59_000 + 90_000), null);
  });

  it("refuses a step that was already used", () => {
    assert.equal(verifyTotp(RFC_SECRET, "287082", 1, 59_000), null);
    assert.equal(verifyTotp(RFC_SECRET, "287082", 0, 59_000), 1);
  });

  it("rejects wrong or malformed codes", () => {
    for (const bad of ["000000", "28708", "2870822", "abcdef", ""]) assert.equal(verifyTotp(RFC_SECRET, bad, -1, 59_000), null);
  });
});

describe("secrets and links", () => {
  it("makes 32-character base32 secrets that differ each time", () => {
    const a = generateTotpSecret();
    assert.match(a, /^[A-Z2-7]{32}$/);
    assert.notEqual(a, generateTotpSecret());
  });

  it("builds an otpauth link with the issuer and the email", () => {
    const uri = otpauthUri("ABC", "a@b.com");
    assert.ok(uri.startsWith("otpauth://totp/Dotkeep%3Aa%40b.com?secret=ABC&issuer=Dotkeep"));
  });
});

describe("recovery codes", () => {
  it("makes 8 distinct codes shaped like xxxxx-xxxxx", () => {
    const codes = generateRecoveryCodes();
    assert.equal(new Set(codes).size, 8);
    for (const code of codes) assert.match(code, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
  });

  it("hashes the same however it was typed", () => {
    assert.equal(hashRecoveryCode("K3F9A-X7MQ2"), hashRecoveryCode(" k3f9a x7mq2 "));
    assert.notEqual(hashRecoveryCode("k3f9a-x7mq2"), hashRecoveryCode("k3f9a-x7mq3"));
  });

  it("tells recovery codes from 6-digit codes", () => {
    assert.ok(looksLikeRecoveryCode("k3f9a-x7mq2"));
    assert.ok(!looksLikeRecoveryCode("123456"));
  });
});
