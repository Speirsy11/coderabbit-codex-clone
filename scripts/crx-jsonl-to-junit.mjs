#!/usr/bin/env node
import { readFileSync } from "node:fs";

const file = process.argv[2];
const input = file && file !== "-" ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
const events = input.split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); }
  catch (err) { throw new Error(`Invalid JSONL at line ${index + 1}: ${err instanceof Error ? err.message : String(err)}`); }
});
const findings = events.filter((event) => event.type === "finding" && ["critical", "major"].includes(event.severity));
const tools = events.filter((event) => event.type === "tool_result" && event.blocking !== false && !event.passed);
const cases = [...findings.map(findingCase), ...tools.map(toolCase)];
const body = cases.length ? cases.join("") : '<testcase classname="crx" name="crx clean"/>';
process.stdout.write(`<testsuite name="crx" tests="${cases.length || 1}" failures="${cases.length}">${body}</testsuite>\n`);
process.exitCode = cases.length ? 3 : 0;

function findingCase(finding) {
  const name = escapeXml(`${finding.severity} ${finding.fileName}${finding.lineStart ? `:${finding.lineStart}` : ""} ${finding.title ?? "finding"}`);
  const text = escapeXml(`${finding.message ?? ""}\n\nImpact: ${finding.impact ?? ""}\nFix: ${finding.codegenInstructions ?? ""}`);
  return `<testcase classname="crx.finding.${escapeXml(finding.category ?? "potential_issue")}" name="${name}"><failure type="${escapeXml(finding.severity)}" message="${escapeXml(finding.title ?? "finding")}">${text}</failure></testcase>`;
}

function toolCase(tool) {
  const text = escapeXml([tool.stderr, tool.stdout].filter(Boolean).join("\n"));
  return `<testcase classname="crx.tool" name="${escapeXml(tool.name)}" time="${Math.max(0, (tool.durationMs ?? 0) / 1000)}"><failure type="tool_result" message="${escapeXml(tool.name)} exited ${tool.exitCode}">${text}</failure></testcase>`;
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
