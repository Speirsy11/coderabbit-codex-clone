import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_NAME, initConfig, loadConfig, sanitizeConfig } from "../src/config.js";

test("config init creates readable config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-"));
  const path = await initConfig(dir);
  const raw = await readFile(path, "utf8");
  assert.match(raw, /codexCommand/);
  const loaded = await loadConfig(dir);
  assert.equal(loaded.codexCommand, "npx -y @openai/codex");
});


test("sanitizeConfig keeps only supported typed values", () => {
  const config = sanitizeConfig({
    codexCommand: 123,
    maxDiffBytes: 999,
    reviewPreferences: [" prefer safety ", 7, ""],
    pathFilters: [" dist/** ", null],
    pathInstructions: [
      { pattern: " src/**/*.ts ", instructions: [" check runtime ", false] },
      { pattern: "docs/**", instructions: " check docs " },
      { pattern: "", instructions: "ignore" }
    ],
    codeGuidelines: { filePatterns: [" AGENTS.md ", 1, ""] },
    localTools: [
      { name: " test ", command: [" npm ", " test "], timeoutMs: 1000, outputLimit: -1, blocking: false },
      { name: "bad", command: [] },
      { command: "npm test" }
    ]
  });

  assert.equal(config.codexCommand, "npx -y @openai/codex");
  assert.equal(config.maxDiffBytes, 180000);
  assert.deepEqual(config.reviewPreferences, ["prefer safety"]);
  assert.deepEqual(config.pathFilters, ["dist/**"]);
  assert.deepEqual(config.pathInstructions, [
    { pattern: "src/**/*.ts", instructions: ["check runtime"] },
    { pattern: "docs/**", instructions: ["check docs"] }
  ]);
  assert.deepEqual(config.codeGuidelines?.filePatterns, ["AGENTS.md"]);
  assert.deepEqual(config.localTools, [{ name: "test", command: ["npm", "test"], timeoutMs: 1000, outputLimit: undefined, blocking: false, enabled: undefined }]);
});

test("loadConfig reports invalid JSON with config filename", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-"));
  await writeFile(join(dir, CONFIG_NAME), "{not-json");
  await assert.rejects(loadConfig(dir), /Invalid crx\.config\.json/);
});
