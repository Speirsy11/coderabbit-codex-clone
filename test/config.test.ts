import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_NAME, configPreset, initConfig, loadConfig, sanitizeConfig } from "../src/config.js";

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
    reviewProfile: "assertive",
    reviewPreferences: [" prefer safety ", 7, ""],
    pathFilters: [" dist/** ", null],
    pathInstructions: [
      { pattern: " src/**/*.ts ", instructions: [" check runtime ", false] },
      { pattern: "docs/**", instructions: " check docs " },
      { pattern: "", instructions: "ignore" }
    ],
    codeGuidelines: { filePatterns: [" AGENTS.md ", 1, ""] },
    localTools: [
      { name: " test ", command: [" npm ", " test "], timeoutMs: 1000, outputLimit: -1, blocking: false, failureSeverity: "critical" },
      { name: "bad", command: [] },
      { command: "npm test" }
    ]
  });

  assert.equal(config.codexCommand, "npx -y @openai/codex");
  assert.equal(config.maxDiffBytes, 180000);
  assert.equal(config.reviewProfile, "assertive");
  assert.deepEqual(config.reviewPreferences, ["prefer safety"]);
  assert.deepEqual(config.pathFilters, ["dist/**"]);
  assert.deepEqual(config.pathInstructions, [
    { pattern: "src/**/*.ts", instructions: ["check runtime"] },
    { pattern: "docs/**", instructions: ["check docs"] }
  ]);
  assert.deepEqual(config.codeGuidelines?.filePatterns, ["AGENTS.md"]);
  assert.deepEqual(config.localTools, [{ name: "test", command: ["npm", "test"], timeoutMs: 1000, outputLimit: undefined, blocking: false, enabled: undefined, failureSeverity: "critical" }]);
});

test("loadConfig reports invalid JSON with config filename", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-"));
  await writeFile(join(dir, CONFIG_NAME), "{not-json");
  await assert.rejects(loadConfig(dir), /Invalid crx\.config\.json/);
});

test("config presets enable common local tools", async () => {
  assert.deepEqual(configPreset("node").localTools?.map((tool) => tool.name), ["test", "build"]);
  assert.deepEqual(configPreset("python").localTools?.map((tool) => tool.name), ["pytest", "ruff"]);
  assert.deepEqual(configPreset("ruby").localTools?.map((tool) => tool.name), ["rspec", "rubocop"]);

  const dir = await mkdtemp(join(tmpdir(), "crx-"));
  await initConfig(dir, "node");
  const loaded = await loadConfig(dir);
  assert.deepEqual(loaded.localTools?.map((tool) => tool.command), [["npm", "test"], ["npm", "run", "build"]]);
});

test("loadConfig maps a supported .coderabbit.yaml subset", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-"));
  await writeFile(join(dir, ".coderabbit.yaml"), `reviews:
  profile: assertive
  path_filters:
    - "dist/**"
    - "vendor/**"
  path_instructions:
    - path: "src/**/*.ts"
      instructions:
        - "Check runtime behavior."
        - "Prefer safe exits."
knowledge_base:
  code_guidelines:
    filePatterns:
      - "AGENTS.md"
      - "docs/review.md"
`);
  const config = await loadConfig(dir);
  assert.equal(config.reviewProfile, "assertive");
  assert.deepEqual(config.pathFilters, ["dist/**", "vendor/**"]);
  assert.deepEqual(config.pathInstructions, [{ pattern: "src/**/*.ts", instructions: ["Check runtime behavior.", "Prefer safe exits."] }]);
  assert.deepEqual(config.codeGuidelines?.filePatterns, ["AGENTS.md", "docs/review.md"]);
});


test("crx.config.json takes precedence over .coderabbit.yaml", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-"));
  await writeFile(join(dir, ".coderabbit.yaml"), "reviews:\n  profile: assertive\n");
  await writeFile(join(dir, CONFIG_NAME), JSON.stringify({ reviewProfile: "chill" }));
  const config = await loadConfig(dir);
  assert.equal(config.reviewProfile, "chill");
});

test("loadConfig maps .coderabbit.yml inline arrays and scalar instructions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-"));
  await writeFile(join(dir, ".coderabbit.yml"), `reviews:
  profile: chill
  path_filters: ["generated/**", "tmp/**"]
  path_instructions:
    - pattern: "docs/**"
      instructions: "Check examples for copy-paste correctness."
knowledge_base:
  code_guidelines:
    filePatterns: ["AGENTS.md", "README.md"]
`);
  const config = await loadConfig(dir);
  assert.equal(config.reviewProfile, "chill");
  assert.deepEqual(config.pathFilters, ["generated/**", "tmp/**"]);
  assert.deepEqual(config.pathInstructions, [{ pattern: "docs/**", instructions: ["Check examples for copy-paste correctness."] }]);
  assert.deepEqual(config.codeGuidelines?.filePatterns, ["AGENTS.md", "README.md"]);
});
