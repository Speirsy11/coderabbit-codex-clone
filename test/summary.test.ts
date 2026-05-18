import test from "node:test";
import assert from "node:assert/strict";
import { agentJsonlToJunit } from "../src/junit.js";
import { agentJsonlToSarif } from "../src/sarif.js";
import { agentJsonlExitCode, parseAgentJsonl, summarizeAgentJsonl, summarizeAgentJsonlJson } from "../src/summary.js";

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


test("summarizeAgentJsonlJson emits dashboard-friendly metrics", () => {
  const jsonl = [
    { type: "review_context", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", repoDir: "/repo", reviewType: "uncommitted", diffBytes: 100, truncated: false, configFiles: [], changedFileStats: [{ fileName: "src/app.ts", status: "modified", additions: 4, deletions: 1 }, { fileName: "src/new.ts", status: "added", additions: 2, deletions: 0 }], excludedFileStats: [{ fileName: "dist/app.js", status: "modified", additions: 8, deletions: 3 }] },
    { type: "finding", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", severity: "critical", category: "potential_issue", fileName: "src/app.ts", title: "Crash", message: "bad", impact: "boom", codegenInstructions: "fix", suggestions: [] },
    { type: "finding", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", severity: "minor", fileName: "src/view.ts", title: "Nit", message: "small", impact: "noise", codegenInstructions: "tidy", suggestions: [] },
    { type: "tool_result", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", name: "lint", command: ["npm", "run", "lint"], exitCode: 2, durationMs: 10, passed: false, blocking: true, timedOut: true, phase: "post_autofix" },
    { type: "complete", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", findingsCount: 2, blockingFindingsCount: 1, blockingToolsCount: 1, exitCode: 3, summary: "2 finding(s); blocking local tool failure." }
  ].map((event) => JSON.stringify(event)).join("\n");

  const metrics = JSON.parse(summarizeAgentJsonlJson(jsonl));
  assert.equal(metrics.findings.total, 2);
  assert.equal(metrics.findings.bySeverity.critical, 1);
  assert.equal(metrics.findings.bySeverity.minor, 1);
  assert.equal(metrics.findings.byCategory.potential_issue, 1);
  assert.equal(metrics.findings.byCategory.uncategorized, 1);
  assert.equal(metrics.findings.blocking, 1);
  assert.equal(metrics.changedFiles.total, 2);
  assert.equal(metrics.changedFiles.additions, 6);
  assert.equal(metrics.changedFiles.deletions, 1);
  assert.equal(metrics.changedFiles.byStatus.modified, 1);
  assert.equal(metrics.changedFiles.byStatus.added, 1);
  assert.equal(metrics.excludedFiles.total, 1);
  assert.equal(metrics.excludedFiles.deletions, 3);
  assert.equal(metrics.localTools.blockingFailures, 1);
  assert.equal(metrics.localTools.timedOut, 1);
  assert.equal(metrics.localTools.byPhase.pre_review, 0);
  assert.equal(metrics.localTools.byPhase.post_autofix, 1);
  assert.equal(metrics.exitCode, 3);
});


test("parseAgentJsonl reports invalid line numbers", () => {
  assert.throws(() => parseAgentJsonl('{"type":"status"}\nnot-json'), /line 2/);
});

test("agentJsonlExitCode preserves quality-gate artifact semantics", () => {
  assert.equal(agentJsonlExitCode(`${JSON.stringify({ type: "complete", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", findingsCount: 0, summary: "clean" })}\n`), 0);
  assert.equal(agentJsonlExitCode(`${JSON.stringify({ type: "finding", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", severity: "major", fileName: "src/app.ts", title: "Crash", message: "bad", impact: "boom", codegenInstructions: "fix", suggestions: [] })}\n`), 3);
  assert.equal(agentJsonlExitCode(`${JSON.stringify({ type: "complete", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", findingsCount: 0, summary: "fixed", needsRerun: true })}\n`), 4);
  assert.equal(agentJsonlExitCode(`${JSON.stringify({ type: "error", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", message: "codex failed" })}\n`), 1);
});


test("agentJsonlToSarif converts findings to SARIF results", () => {
  const jsonl = `${JSON.stringify({ type: "finding", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", severity: "major", category: "potential_issue", fileName: "src/app.ts", lineStart: 12, title: "Crash", message: "bad", impact: "boom", codegenInstructions: "fix", suggestions: [] })}\n`;
  const sarif = JSON.parse(agentJsonlToSarif(jsonl));
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].results[0].level, "error");
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, "src/app.ts");
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine, 12);
});


test("agentJsonlToJunit converts blockers to failing test cases", () => {
  const jsonl = [
    { type: "finding", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", severity: "critical", category: "potential_issue", fileName: "src/app.ts", lineStart: 3, title: "Crash", message: "bad", impact: "boom", codegenInstructions: "fix", suggestions: [] },
    { type: "tool_result", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", name: "lint", command: ["npm", "run", "lint"], exitCode: 2, durationMs: 10, passed: false, blocking: true, stderr: "lint bad" }
  ].map((event) => JSON.stringify(event)).join("\n");
  const xml = agentJsonlToJunit(jsonl);
  assert.match(xml, /<testsuite name="crx" tests="2" failures="2">/);
  assert.match(xml, /CRITICAL src\/app\.ts:3 Crash/);
  assert.match(xml, /MAJOR local tool lint failed with exit 2/);
});
