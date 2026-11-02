import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBackup, parseJsonVariables, serializeBackup, serializeJsonVariables } from "../../src/lib/vault-json.ts";

const check = {
  environment: (value) => (["local", "staging", "production"].includes(value) ? value : undefined),
  type: (value) => (["api_key", "other"].includes(value) ? value : undefined),
};

describe("parseJsonVariables", () => {
  it("reads a flat object, keeping numbers and booleans as text", () => {
    const result = parseJsonVariables('{ "A": "1", "PORT": 3000, "DEBUG": true }');
    assert.deepEqual(result.entries, [
      { name: "A", value: "1" },
      { name: "PORT", value: "3000" },
      { name: "DEBUG", value: "true" },
    ]);
    assert.deepEqual(result.errors, []);
  });

  it("reports values it can't use and keeps the rest", () => {
    const result = parseJsonVariables('{ "OK": "x", "NESTED": { "a": 1 }, "EMPTY": "  ", "NULLED": null }');
    assert.deepEqual(result.entries, [{ name: "OK", value: "x" }]);
    assert.equal(result.errors.length, 3);
  });

  it("rejects text that isn't a JSON object", () => {
    assert.match(parseJsonVariables("A=1").errors[0].message, /valid JSON/);
    assert.match(parseJsonVariables('["A"]').errors[0].message, /object/);
    assert.deepEqual(parseJsonVariables("null").entries, []);
  });

  it("accepts a BOM and round-trips through serializeJsonVariables", () => {
    const entries = [{ name: "A", value: 'with "quotes"\nand a newline' }, { name: "B", value: "2" }];
    assert.deepEqual(parseJsonVariables("﻿" + serializeJsonVariables(entries)).entries, entries);
  });
});

describe("backup", () => {
  const projects = [
    {
      name: "Shop",
      description: "the store",
      secrets: [
        { name: "STRIPE_KEY", environment: "production", type: "api_key", description: "live key", value: "sk_live_1" },
        { name: "STRIPE_KEY", environment: "local", type: "api_key", description: "", value: "sk_test_1" },
      ],
    },
    { name: "Empty", description: "", secrets: [] },
  ];

  it("round-trips projects, environments, types and notes", () => {
    const result = parseBackup(serializeBackup(projects, new Date("2026-01-02T03:04:05Z")), check);
    assert.equal(result.ok, true);
    assert.deepEqual(result.projects, projects);
    assert.deepEqual(result.errors, []);
  });

  it("records when it was made", () => {
    assert.equal(JSON.parse(serializeBackup([], new Date("2026-01-02T03:04:05Z"))).exportedAt, "2026-01-02T03:04:05.000Z");
  });

  it("refuses files that aren't a Dotkeep backup, or are a version it doesn't know", () => {
    assert.equal(parseBackup("nope", check).ok, false);
    assert.equal(parseBackup('{ "A": "1" }', check).ok, false);
    assert.match(parseBackup('{ "app": "dotkeep", "version": 99, "projects": [] }', check).error, /version 99/);
    assert.equal(parseBackup('{ "app": "dotkeep", "version": 1 }', check).ok, false);
  });

  it("skips and reports secrets with an unknown environment or type, or no value", () => {
    const text = JSON.stringify({
      app: "dotkeep",
      version: 1,
      projects: [
        {
          name: "P",
          secrets: [
            { name: "GOOD", environment: "local", type: "other", value: "v" },
            { name: "BAD_ENV", environment: "qa", type: "other", value: "v" },
            { name: "BAD_TYPE", environment: "local", type: "banana", value: "v" },
            { name: "NO_VALUE", environment: "local", type: "other", value: "" },
            { environment: "local", type: "other", value: "v" },
          ],
        },
        { secrets: [] },
      ],
    });
    const result = parseBackup(text, check);
    assert.equal(result.ok, true);
    assert.deepEqual(result.projects.map((p) => p.secrets.map((s) => s.name)), [["GOOD"]]);
    assert.equal(result.errors.length, 5);
  });

  it("trims names but never the value", () => {
    const text = JSON.stringify({ app: "dotkeep", version: 1, projects: [{ name: " P ", secrets: [{ name: " K ", environment: "local", type: "other", value: " spaced\n" }] }] });
    const [project] = parseBackup(text, check).projects;
    assert.equal(project.name, "P");
    assert.deepEqual(project.secrets[0], { name: "K", environment: "local", type: "other", description: "", value: " spaced\n" });
  });
});
