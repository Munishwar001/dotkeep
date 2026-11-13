import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { Collection } from "mongodb";
import { createWorld } from "../helpers.mjs";
import { createVault, encryptValue } from "../../src/lib/e2ee.ts";

// Node strips TypeScript; resolve the application's aliases for direct database integration tests.
const root = new URL("../../src/", import.meta.url);
const hooks = registerHooks({
  load(url, context, next) {
    if (url.startsWith(root.href) && url.endsWith(".ts")) {
      const { outputText } = ts.transpileModule(readFileSync(new URL(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
      return { format: "module", source: outputText, shortCircuit: true };
    }
    return next(url, context);
  },
  resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) return next(new URL(specifier.slice(2) + ".ts", root).href, context);
  if (specifier.startsWith(".") && context.parentURL?.startsWith(root.href)) {
    const candidate = new URL(specifier + ".ts", context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
  }
  return next(specifier, context);
} });
const { updateSecret } = await import("../../src/db/secrets.ts");
const { migrateSecrets } = await import("../../src/db/e2ee-migration.ts");
const { getMongoClient } = await import("../../src/lib/mongodb.ts");

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test("migration cannot succeed between replacing a value and inserting its history", { timeout: 20000 }, async () => {
  const world = await createWorld();
  const entered = deferred(), release = deferred(), migrating = deferred();
  const insertOne = Collection.prototype.insertOne;
  const updateOne = Collection.prototype.updateOne;
  let writer, migration;
  try {
    const user = await world.user("atomic-history");
    const project = (await user.call("POST", "/api/vault/projects", { name: "History" })).data.project;
    const secret = (await user.call("POST", "/api/vault/secrets", { projectId: project.id, name: "KEY", value: "before", environment: "local", type: "other" })).data.secret;
    const id = new world.ObjectId(secret.id);
    const actor = { id: user.objectId, name: user.name };
    const vault = await createVault("correct horse battery staple", 200_000);
    Collection.prototype.insertOne = async function(doc, options) {
      if (this.collectionName === "secret_versions" && doc.secretId.equals(id)) {
        entered.resolve();
        await release.promise;
      }
      return insertOne.call(this, doc, options);
    };
    writer = updateSecret(user.objectId, actor, id, { value: "after" });
    await entered.promise;
    await world.db.collection("users").updateOne({ _id: user.objectId }, { $set: { vaultKeys: vault.record } });
    Collection.prototype.updateOne = async function(filter, update, options) {
      if (this.collectionName === "projects" && update.$inc?.writeRevision) migrating.resolve();
      return updateOne.call(this, filter, update, options);
    };
    migration = migrateSecrets(user.objectId, actor, [{ id, cipher: await encryptValue(vault.vaultKey, "before", `${user.id}:${id}`), versions: [] }]);
    await migrating.promise;
    release.resolve();
    assert.ok(await writer);
    const result = await migration;
    assert.equal(result.migrated, 0);
    assert.match(result.failed[0].error, /history changed/);
    const history = await world.db.collection("secret_versions").find({ secretId: id }).toArray();
    assert.equal(history.length, 1);
    assert.ok(!history[0].valueEncrypted.startsWith("e1$"));
  } finally {
    release.resolve();
    await Promise.allSettled([writer, migration]);
    Collection.prototype.insertOne = insertOne;
    Collection.prototype.updateOne = updateOne;
    await world.close();
    await getMongoClient().close();
    hooks.deregister();
  }
});
