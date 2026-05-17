import test from "node:test";
import assert from "node:assert/strict";
import { formatJsonl, formatPlain } from "../src/format.js";
import type { Finding } from "../src/types.js";

const finding: Finding = {
  type: "finding",
  severity: "critical",
  fileName: "src/a.ts",
  lineStart: 5,
  title: "Unsafe spawn",
  message: "Uses shell.",
  impact: "Command injection.",
  codegenInstructions: "Use spawn args.",
  suggestions: ["Pass shell:false"]
};

test("formats JSONL one object per line", () => {
  const out = formatJsonl([{ type: "status", message: "x" }, finding]);
  const lines = out.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[1].type, "finding");
});

test("plain formatter groups by severity and notes truncation", () => {
  const out = formatPlain([finding], { truncated: true, diffBytes: 200000 });
  assert.match(out, /CRITICAL/);
  assert.match(out, /truncated/);
  assert.match(out, /Fix: Use spawn args/);
});
