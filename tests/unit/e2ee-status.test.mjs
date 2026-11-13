import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Evaluate the real client module with only its HTTP boundary replaced.
function client(apiGet) {
  const source = readFileSync(new URL("../../src/modules/e2ee/vault-key.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: (name) => name.endsWith("client-api") ? { apiGet } : {} });
  return exports;
}

test("failed encryption status rejects, is not cached, and can retry", async () => {
  let calls = 0;
  const { e2eeStatus } = client(async () => ++calls === 1 ? { ok: false, error: "Unavailable" } : { ok: true, data: { enabled: true, userId: "owner" } });
  await assert.rejects(e2eeStatus(), /Unavailable/);
  assert.equal((await e2eeStatus()).enabled, true);
  await e2eeStatus();
  assert.equal(calls, 2);
});

test("only a successful disabled lookup returns and caches disabled", async () => {
  let calls = 0;
  const { e2eeStatus } = client(async () => { calls++; return { ok: true, data: { enabled: false, userId: "owner" } }; });
  assert.equal((await e2eeStatus()).enabled, false);
  assert.equal((await e2eeStatus()).userId, "owner");
  assert.equal(calls, 1);
});
