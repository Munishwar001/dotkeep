import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv, serializeEnv } from "../../src/lib/dotenv.ts";

const names = (result) => result.entries.map((e) => e.name);
const valueOf = (result, name) => result.entries.find((e) => e.name === name)?.value;

describe("parseEnv", () => {
  it("reads plain NAME=value lines and skips comments and blank lines", () => {
    const result = parseEnv("# a comment\n\nA=1\nB = two\n");
    assert.deepEqual(result.entries, [{ name: "A", value: "1" }, { name: "B", value: "two" }]);
    assert.deepEqual(result.errors, []);
  });

  it("accepts the `export` prefix, CRLF line endings and a BOM", () => {
    const result = parseEnv("﻿export A=1\r\nB=2\r\n");
    assert.deepEqual(names(result), ["A", "B"]);
  });

  it("strips inline comments from unquoted values, but not a # without a space before it", () => {
    const result = parseEnv("A=value # note\nB=pa#ss\n");
    assert.equal(valueOf(result, "A"), "value");
    assert.equal(valueOf(result, "B"), "pa#ss");
  });

  it("keeps = and special characters inside values", () => {
    const result = parseEnv("URL=postgres://u:p@h:5432/db?x=1&y=2\n");
    assert.equal(valueOf(result, "URL"), "postgres://u:p@h:5432/db?x=1&y=2");
  });

  it("handles double quotes: escapes and a # that is not a comment", () => {
    const result = parseEnv('A="line1\\nline2"\nB="say \\"hi\\" # not a comment"\nC="back\\\\slash"\n');
    assert.equal(valueOf(result, "A"), "line1\nline2");
    assert.equal(valueOf(result, "B"), 'say "hi" # not a comment');
    assert.equal(valueOf(result, "C"), "back\\slash");
  });

  it("leaves single-quoted values exactly as written", () => {
    const result = parseEnv("A='no \\n escape # here'\n");
    assert.equal(valueOf(result, "A"), "no \\n escape # here");
  });

  it("reads a quoted value that spans several lines", () => {
    const result = parseEnv('KEY="-----BEGIN-----\nabc\n-----END-----"\nNEXT=1\n');
    assert.equal(valueOf(result, "KEY"), "-----BEGIN-----\nabc\n-----END-----");
    assert.equal(valueOf(result, "NEXT"), "1");
  });

  it("lets the last of a repeated name win", () => {
    const result = parseEnv("A=1\nB=2\nA=3\n");
    assert.deepEqual(result.entries, [{ name: "B", value: "2" }, { name: "A", value: "3" }]);
  });

  it("reports bad lines with their line number and keeps the good ones", () => {
    const result = parseEnv("GOOD=1\nbad line\nEMPTY=\n1BAD=x\nUNCLOSED=\"abc\n");
    assert.deepEqual(names(result), ["GOOD"]);
    assert.deepEqual(result.errors.map((e) => e.line), [2, 3, 4, 5]);
  });
});

describe("serializeEnv", () => {
  it("writes simple values bare and everything else double-quoted with escapes", () => {
    const text = serializeEnv([
      { name: "SIMPLE", value: "abc-123_./:=" },
      { name: "SPACE", value: "a b" },
      { name: "HASH", value: "x#y" },
      { name: "NL", value: "l1\nl2" },
    ]);
    assert.equal(text, 'SIMPLE=abc-123_./:=\nSPACE="a b"\nHASH="x#y"\nNL="l1\\nl2"\n');
  });

  it("returns an empty string for no entries", () => {
    assert.equal(serializeEnv([]), "");
  });

  it("round-trips awkward values through parseEnv", () => {
    const entries = [
      { name: "A", value: 'quote " and \\ backslash' },
      { name: "B", value: "multi\nline\r\nvalue" },
      { name: "C", value: "  padded  " },
      { name: "D", value: "p4ss#w0rd with 'single' quotes" },
      { name: "E", value: "plain" },
    ];
    assert.deepEqual(parseEnv(serializeEnv(entries)).entries, entries);
  });
});
