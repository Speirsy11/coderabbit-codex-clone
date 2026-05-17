import test from "node:test";
import assert from "node:assert/strict";
import { buildDiffArgs } from "../src/git.js";

test("builds uncommitted diff args", () => {
  assert.deepEqual(buildDiffArgs("uncommitted"), ["diff", "--no-ext-diff", "--no-color", "HEAD"]);
});

test("builds committed diff args", () => {
  assert.deepEqual(buildDiffArgs("committed"), ["diff", "--no-ext-diff", "--no-color", "HEAD~1...HEAD"]);
});

test("base overrides type", () => {
  assert.deepEqual(buildDiffArgs("all", "main"), ["diff", "--no-ext-diff", "--no-color", "main...HEAD"]);
});

test("base commit overrides base", () => {
  assert.deepEqual(buildDiffArgs("all", "main", "abc123"), ["diff", "--no-ext-diff", "--no-color", "abc123...HEAD"]);
});
