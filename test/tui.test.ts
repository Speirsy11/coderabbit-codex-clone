import assert from "node:assert/strict";
import { test } from "node:test";
import { renderAutoFixResult } from "../src/tui.js";
import { renderTuiSummary } from "../src/tui.js";
import type { Finding, ReviewContextEvent } from "../src/types.js";

test("renderTuiSummary shows counts and review context", () => {
  const finding: Finding = {
    type: "finding",
    severity: "major",
    fileName: "src/app.ts",
    title: "Bug",
    message: "Something is wrong.",
    impact: "Breaks production.",
    codegenInstructions: "Fix it.",
    suggestions: []
  };
  const context: ReviewContextEvent = {
    type: "review_context",
    repoDir: "/repo",
    reviewType: "uncommitted",
    diffBytes: 123,
    truncated: false,
    configFiles: []
  };
  const output = renderTuiSummary([finding], context);
  assert.match(output, /crx Codex review/);
  assert.match(output, /major 1/);
  assert.match(output, /src\/app.ts/);
});

test("renderAutoFixResult marks applied and skipped fixes", () => {
  assert.equal(renderAutoFixResult({ applied: true, summary: "Applied." }), "✓ Auto-fix: Applied.");
  assert.equal(renderAutoFixResult({ applied: false, summary: "No patch." }), "! Auto-fix: No patch.");
});
