import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentJsonl, summarizeAgentJsonl } from "../src/summary.js";

test("summarizeAgentJsonl highlights blocking findings and tool failures", () => {
  const jsonl = [
    { type: "finding", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", severity: "major", fileName: "src/app.ts", lineStart: 7, title: "Crash", message: "bad", impact: "boom", codegenInstructions: "fix", suggestions: [] },
    { type: "tool_result", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", name: "lint", command: ["npm", "run", "lint"], exitCode: 2, durationMs: 10, passed: false, blocking: true },
    { type: "complete", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", findingsCount: 1, summary: "1 finding(s); blocking local tool failure." }
  ].map((event) => JSON.stringify(event)).join("\n");

  const summary = summarizeAgentJsonl(jsonl);
  assert.match(summary, /Findings: 1 \(critical 0, major 1/);
  assert.match(summary, /Local tools: 1 run, 1 failed, 1 blocking/);
  assert.match(summary, /MAJOR src\/app\.ts:7 Crash/);
  assert.match(summary, /lint: exit 2/);
});

test("parseAgentJsonl reports invalid line numbers", () => {
  assert.throws(() => parseAgentJsonl('{"type":"status"}\nnot-json'), /line 2/);
});
