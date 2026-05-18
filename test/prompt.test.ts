import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewPrompt } from "../src/prompt.js";

test("buildReviewPrompt compacts oversized instruction and tool context", () => {
  const prompt = buildReviewPrompt({
    options: { dir: "/repo", type: "uncommitted", configFiles: [], color: false, maxDiffBytes: 1000, mode: "plain" },
    diff: "diff --git a/src/app.ts b/src/app.ts\n",
    truncated: false,
    configText: "a".repeat(30010),
    toolResultText: "b".repeat(20010),
    pathInstructionText: "(none)",
    config: {}
  });

  assert.match(prompt, /CRX_INSTRUCTION_CONTEXT_TRUNCATED: original 30010 chars, shown 30000 chars/);
  assert.match(prompt, /CRX_LOCAL_TOOL_CONTEXT_TRUNCATED: original 20010 chars, shown 20000 chars/);
  assert.equal(prompt.includes("a".repeat(30001)), false);
  assert.equal(prompt.includes("b".repeat(20001)), false);
});
