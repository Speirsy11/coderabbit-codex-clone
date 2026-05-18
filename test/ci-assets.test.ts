import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

test("agent event schema is valid JSON and tracks protocol version", async () => {
  const raw = await readFile(resolve(projectRoot, "docs/schema/agent-event.schema.json"), "utf8");
  const schema = JSON.parse(raw);
  assert.equal(schema.properties.protocolVersion.const, "0.2");
  assert.equal(schema.properties.schemaVersion.const, "crx.agent.v0.2");
  assert.ok(schema.properties.type.enum.includes("finding"));
  assert.ok(schema.properties.type.enum.includes("tool_result"));
  assert.ok(schema.properties.type.enum.includes("worktree_status"));
});

test("quality gate shell wrapper parses", () => {
  const result = spawnSync("bash", ["-n", "scripts/crx-quality-gate.sh"], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});


test("agent loop shell wrapper parses", () => {
  const result = spawnSync("bash", ["-n", "scripts/crx-agent-loop.sh"], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});


test("jsonl summary helper reports blocking artifacts", () => {
  const input = [
    JSON.stringify({ type: "tool_result", name: "lint", exitCode: 2, passed: false, blocking: true }),
    JSON.stringify({ type: "finding", severity: "major", fileName: "src/app.ts", title: "Bug" }),
    JSON.stringify({ type: "complete", findingsCount: 1, summary: "1 finding." })
  ].join("\n") + "\n";
  const result = spawnSync(process.execPath, ["scripts/crx-jsonl-summary.mjs", "-"], { cwd: projectRoot, input, encoding: "utf8" });
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout, /Blocking findings:/);
  assert.match(result.stdout, /Blocking tool failures:/);
});

test("jsonl to sarif helper converts findings for code scanning", () => {
  const input = [
    JSON.stringify({
      type: "finding",
      severity: "major",
      category: "potential_issue",
      fileName: "src/app.ts",
      lineStart: 7,
      title: "Crash",
      message: "Possible undefined access",
      impact: "Runtime failure",
      codegenInstructions: "Guard the value.",
      suggestions: [{ fileName: "src/app.ts", lineStart: 7, lineEnd: 7, replacement: "if (!user) return;" }]
    }),
    JSON.stringify({ type: "complete", findingsCount: 1, summary: "1 finding." })
  ].join("\n") + "\n";
  const result = spawnSync(process.execPath, ["scripts/crx-jsonl-to-sarif.mjs", "-"], { cwd: projectRoot, input, encoding: "utf8" });
  assert.equal(result.status, 3, result.stderr);
  const sarif = JSON.parse(result.stdout);
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].tool.driver.name, "crx");
  assert.equal(sarif.runs[0].results[0].ruleId, "crx/potential_issue/major");
  assert.equal(sarif.runs[0].results[0].level, "error");
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, "src/app.ts");
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine, 7);
});


test("sarif helper converts findings", () => {
  const input = JSON.stringify({
    type: "finding",
    severity: "major",
    category: "potential_issue",
    fileName: "src/app.ts",
    lineStart: 3,
    title: "Crash",
    message: "Null access",
    impact: "Runtime failure",
    codegenInstructions: "Add guard",
    suggestions: ["Check null"]
  }) + "\n";
  const result = spawnSync(process.execPath, ["scripts/crx-jsonl-to-sarif.mjs", "-"], { cwd: projectRoot, input, encoding: "utf8" });
  assert.equal(result.status, 3, result.stderr);
  const sarif = JSON.parse(result.stdout);
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].results[0].ruleId, "crx/potential_issue/major");
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine, 3);
});


test("junit helper converts blocking results", () => {
  const input = JSON.stringify({ type: "tool_result", name: "lint", exitCode: 2, durationMs: 12, passed: false, blocking: true, stderr: "bad" }) + "\n";
  const result = spawnSync(process.execPath, ["scripts/crx-jsonl-to-junit.mjs", "-"], { cwd: projectRoot, input, encoding: "utf8" });
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout, /<testsuite name="crx"/);
  assert.match(result.stdout, /<failure type="tool_result"/);
});
