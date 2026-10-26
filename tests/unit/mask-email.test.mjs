import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskEmail } from "../../src/lib/mask-email.ts";

describe("maskEmail", () => {
  it("keeps only the first letter of the name and of the domain, and the ending", () => {
    assert.equal(maskEmail("jane.doe@gmail.com"), "j***@g***.com");
    assert.equal(maskEmail("a@b.co.uk"), "a***@b***.uk");
  });

  it("never contains the rest of the address", () => {
    const masked = maskEmail("munish@wottacore.com");
    assert.ok(!masked.includes("unish") && !masked.includes("ottacore"));
  });

  it("copes with odd input without throwing", () => {
    assert.equal(maskEmail("no-at-sign"), "***");
    assert.equal(maskEmail("@x.com"), "***");
    assert.equal(maskEmail("a@localhost"), "a***@l***");
  });
});
