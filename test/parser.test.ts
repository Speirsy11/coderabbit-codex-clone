import test from "node:test";
import assert from "node:assert/strict";
import { parseCodexFindings } from "../src/parser.js";

test("parses fenced JSON object findings", () => {
  const findings = parseCodexFindings('```json\n{"findings":[{"severity":"major","fileName":"a.ts","title":"Bug","message":"Broken","impact":"Bad","codegenInstructions":"Fix","suggestions":["x"]}]}\n```');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "major");
  assert.equal(findings[0].type, "finding");
});

test("recovers array embedded in text", () => {
  const findings = parseCodexFindings('Here: [{"severity":"weird","fileName":"b.ts","title":"T","message":"M"}] thanks');
  assert.equal(findings[0].severity, "info");
});

test("throws on invalid output", () => {
  assert.throws(() => parseCodexFindings("not json"));
});
