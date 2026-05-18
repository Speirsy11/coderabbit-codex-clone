import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PATH_FILTERS, effectiveGuidelineFiles, filterDiffByPath, filesFromDiff, fileStatsFromDiff, matchesPathPattern, renderPathInstructions } from "../src/scope.js";

test("matches common glob patterns", () => {
  assert.equal(matchesPathPattern("src/app/main.ts", "src/**/*.ts"), true);
  assert.equal(matchesPathPattern("node_modules/pkg/index.js", "node_modules/**"), true);
  assert.equal(matchesPathPattern("assets/logo.png", "*.png"), true);
  assert.equal(matchesPathPattern("src/api/user.generated.ts", "*.generated.*"), true);
  assert.equal(matchesPathPattern("package-lock.json", "package-lock.json"), true);
  assert.equal(matchesPathPattern("src/app/main.ts", "test/**/*.ts"), false);
});

test("filters diff blocks by path", () => {
  const diff = [
    "diff --git a/src/app.ts b/src/app.ts",
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "diff --git a/dist/app.js b/dist/app.js",
    "--- a/dist/app.js",
    "+++ b/dist/app.js",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    ""
  ].join("\n");
  const result = filterDiffByPath(diff, DEFAULT_PATH_FILTERS);
  assert.match(result.diff, /src\/app\.ts/);
  assert.doesNotMatch(result.diff, /dist\/app\.js/);
  assert.deepEqual(result.excludedFiles, ["dist/app.js"]);
  assert.deepEqual(result.excludedFileStats, [{ fileName: "dist/app.js", status: "modified", additions: 1, deletions: 1 }]);
});

test("default filters exclude nested generated, lock, binary, and media paths", () => {
  for (const file of [
    "src/api/client.generated.ts",
    "assets/images/logo.png",
    "frontend/yarn.lock",
    "cache/data.wasm",
    "lib/__pycache__/mod.pyc",
    "target/release/app"
  ]) {
    assert.equal(DEFAULT_PATH_FILTERS.some((pattern) => matchesPathPattern(file, pattern)), true, file);
  }
});

test("renders only path instructions that match changed files", () => {
  const text = renderPathInstructions(
    {
      pathInstructions: [
        { pattern: "src/**/*.ts", instructions: ["Check CLI behavior."] },
        { pattern: "docs/**", instructions: "Check docs." }
      ]
    },
    ["src/cli.ts"]
  );
  assert.match(text, /Check CLI behavior/);
  assert.doesNotMatch(text, /Check docs/);
});

test("extracts diff file list, stats, and keeps default guideline files", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,3 @@",
    " keep",
    "-old",
    "+new",
    "+extra",
    "diff --git a/src/new.ts b/src/new.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/src/new.ts",
    "@@ -0,0 +1 @@",
    "+created",
    "diff --git a/src/old.ts b/src/old.ts",
    "deleted file mode 100644",
    "--- a/src/old.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-gone",
    "diff --git a/src/name.ts b/src/renamed.ts",
    "similarity index 100%",
    "rename from src/name.ts",
    "rename to src/renamed.ts",
    ""
  ].join("\n");
  assert.deepEqual(filesFromDiff(diff), ["src/a.ts", "src/new.ts", "src/old.ts", "src/renamed.ts"]);
  assert.deepEqual(fileStatsFromDiff(diff), [
    { fileName: "src/a.ts", status: "modified", additions: 2, deletions: 1 },
    { fileName: "src/new.ts", status: "added", additions: 1, deletions: 0 },
    { fileName: "src/old.ts", status: "deleted", additions: 0, deletions: 1 },
    { fileName: "src/renamed.ts", status: "renamed", additions: 0, deletions: 0 }
  ]);
  assert.ok(effectiveGuidelineFiles({}).includes("AGENTS.md"));
});
