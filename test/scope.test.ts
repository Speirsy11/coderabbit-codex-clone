import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PATH_FILTERS, effectiveGuidelineFiles, filterDiffByPath, filesFromDiff, matchesPathPattern, renderPathInstructions } from "../src/scope.js";

test("matches common glob patterns", () => {
  assert.equal(matchesPathPattern("src/app/main.ts", "src/**/*.ts"), true);
  assert.equal(matchesPathPattern("node_modules/pkg/index.js", "node_modules/**"), true);
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

test("extracts diff file list and keeps default guideline files", () => {
  const diff = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n";
  assert.deepEqual(filesFromDiff(diff), ["src/a.ts"]);
  assert.ok(effectiveGuidelineFiles({}).includes("AGENTS.md"));
});
