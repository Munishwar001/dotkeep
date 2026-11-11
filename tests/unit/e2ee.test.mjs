import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changePassphrase, createVault, decryptValue, E2EE_VALUE_PATTERN, encryptValue, isE2eeValue, newObjectIdHex, unlockVault, WrongKeyError } from "../../src/lib/e2ee.ts";

const PASSPHRASE = "correct horse battery staple";
const FAST = 1000; // the real setting is 600,000; tests don't need to wait for it

describe("vault key", () => {
  it("opens with the passphrase and with the recovery key, and they unlock the same vault", async () => {
    const { vaultKey, record, recoveryKey } = await createVault(PASSPHRASE, FAST);
    const sealed = await encryptValue(vaultKey, "s3cret", "u1:s1");
    const byPassphrase = await unlockVault(record, { passphrase: PASSPHRASE });
    const byRecovery = await unlockVault(record, { recoveryKey });
    assert.equal(await decryptValue(byPassphrase, sealed, "u1:s1"), "s3cret");
    assert.equal(await decryptValue(byRecovery, sealed, "u1:s1"), "s3cret");
  });

  it("refuses a wrong passphrase and a wrong recovery key", async () => {
    const { record, recoveryKey } = await createVault(PASSPHRASE, FAST);
    await assert.rejects(unlockVault(record, { passphrase: "not the passphrase" }), WrongKeyError);
    await assert.rejects(unlockVault(record, { recoveryKey: recoveryKey.replace(/^./, (c) => (c === "A" ? "B" : "A")) }), WrongKeyError);
    await assert.rejects(unlockVault(record, { recoveryKey: "nonsense" }), WrongKeyError);
  });

  it("accepts a recovery key typed in lower case with spaces", async () => {
    const { record, recoveryKey } = await createVault(PASSPHRASE, FAST);
    await unlockVault(record, { recoveryKey: recoveryKey.toLowerCase().replaceAll("-", " ") });
  });

  it("rejects a short passphrase", async () => {
    await assert.rejects(createVault("short", FAST));
  });

  it("the record holds no key material in the clear", async () => {
    const { record, recoveryKey } = await createVault(PASSPHRASE, FAST);
    const text = JSON.stringify(record);
    assert.ok(!text.includes(PASSPHRASE));
    assert.ok(!text.includes(recoveryKey));
  });

  it("changes the passphrase without changing the vault, using the old passphrase or the recovery key", async () => {
    const { vaultKey, record, recoveryKey } = await createVault(PASSPHRASE, FAST);
    const sealed = await encryptValue(vaultKey, "keep me", "u1:s1");

    const viaOld = await changePassphrase(record, { passphrase: PASSPHRASE }, "a brand new passphrase", FAST);
    await assert.rejects(unlockVault(viaOld.record, { passphrase: PASSPHRASE }), WrongKeyError);
    assert.equal(await decryptValue(await unlockVault(viaOld.record, { passphrase: "a brand new passphrase" }), sealed, "u1:s1"), "keep me");

    const viaRecovery = await changePassphrase(record, { recoveryKey }, "another new passphrase", FAST);
    assert.equal(await decryptValue(await unlockVault(viaRecovery.record, { passphrase: "another new passphrase" }), sealed, "u1:s1"), "keep me");
    assert.equal(viaRecovery.record.wrappedByRecovery, record.wrappedByRecovery);

    await assert.rejects(changePassphrase(record, { passphrase: "wrong wrong wrong" }, "x".repeat(14), FAST), WrongKeyError);
  });
});

describe("values", () => {
  it("round-trips any text, including unicode, newlines and empty-looking edges", async () => {
    const { vaultKey } = await createVault(PASSPHRASE, FAST);
    for (const text of ["x", "line1\nline2", "  spaces  ", "pässwörd-✓-日本語", "a".repeat(10_000)]) {
      assert.equal(await decryptValue(vaultKey, await encryptValue(vaultKey, text, "u:s"), "u:s"), text);
    }
  });

  it("uses a fresh IV, so the same value looks different each time", async () => {
    const { vaultKey } = await createVault(PASSPHRASE, FAST);
    assert.notEqual(await encryptValue(vaultKey, "same", "u:s"), await encryptValue(vaultKey, "same", "u:s"));
  });

  it("is bound to its owner and secret, and to the vault key", async () => {
    const { vaultKey } = await createVault(PASSPHRASE, FAST);
    const other = (await createVault(PASSPHRASE, FAST)).vaultKey;
    const sealed = await encryptValue(vaultKey, "bound", "owner:secret1");
    await assert.rejects(decryptValue(vaultKey, sealed, "owner:secret2"));
    await assert.rejects(decryptValue(vaultKey, sealed, "other:secret1"));
    await assert.rejects(decryptValue(other, sealed, "owner:secret1"));
  });

  it("fails on tampering instead of returning wrong data", async () => {
    const { vaultKey } = await createVault(PASSPHRASE, FAST);
    const sealed = await encryptValue(vaultKey, "tamper", "u:s");
    const [version, iv, body] = sealed.split("$");
    const flipped = body.replace(/^./, (c) => (c === "A" ? "B" : "A"));
    await assert.rejects(decryptValue(vaultKey, [version, iv, flipped].join("$"), "u:s"));
    await assert.rejects(decryptValue(vaultKey, "v1$a$b$c", "u:s"));
  });

  it("produces what the server's shape check accepts, and the prefix test recognises", async () => {
    const { vaultKey } = await createVault(PASSPHRASE, FAST);
    const sealed = await encryptValue(vaultKey, "shape", "u:s");
    assert.match(sealed, E2EE_VALUE_PATTERN);
    assert.ok(isE2eeValue(sealed));
    assert.ok(!isE2eeValue("v1$a$b$c"));
    assert.match(newObjectIdHex(), /^[0-9a-f]{24}$/);
  });
});
