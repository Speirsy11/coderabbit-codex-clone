import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyPatch, buildAutoFixPrompt, extractUnifiedDiff, filesFromPatch } from "../src/autofix.js";
import type { Finding } from "../src/types.js";
import { spawnSync } from "node:child_process";

const finding: Finding = {
  type: "finding",
  severity: "major",
  fileName: "src/example.ts",
  lineStart: 1,
  title: "Missing null guard",
  message: "The code dereferences a nullable value.",
  impact: "Can crash at runtime.",
  codegenInstructions: "Add a guard before dereferencing.",
  suggestions: []
};

test("buildAutoFixPrompt targets findings and asks for unified diff only", () => {
  const prompt = buildAutoFixPrompt({ findings: [finding], diff: "diff --git a/src/example.ts b/src/example.ts", truncated: false, config: {} });
  assert.match(prompt, /Return ONLY a unified diff patch/);
  assert.match(prompt, /Missing null guard/);
  assert.match(prompt, /Add a guard/);
});

test("extractUnifiedDiff accepts fenced or prefixed patch output", () => {
  assert.equal(extractUnifiedDiff("Here you go\n```diff\ndiff --git a/a b/a\n--- a/a\n+++ b/a\n```"), "diff --git a/a b/a\n--- a/a\n+++ b/a\n");
  assert.equal(extractUnifiedDiff("notes\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-a\n+b"), "--- a/a\n+++ b/a\n@@ -1 +1 @@\n-a\n+b\n");
  assert.equal(extractUnifiedDiff("no patch"), "");
});

test("filesFromPatch returns touched files", () => {
  assert.deepEqual(filesFromPatch("diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\ndiff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n"), ["a.txt", "src/b.ts"]);
});

test("applyPatch checks and applies a generated git patch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-autofix-"));
  try {
    spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" });
    await writeFile(join(dir, "example.txt"), "old\n", "utf8");
    spawnSync("git", ["add", "example.txt"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], {
      cwd: dir,
      stdio: "ignore",
      env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" }
    });

    const patch = "diff --git a/example.txt b/example.txt\nindex 3367afd..3e75765 100644\n--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-old\n+new\n";
    const result = await applyPatch(dir, patch);
    assert.equal(result.applied, true);
    assert.deepEqual(result.changedFiles, ["example.txt"]);
    const content = spawnSync("git", ["diff", "--", "example.txt"], { cwd: dir, encoding: "utf8" }).stdout;
    assert.match(content, /\+new/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
