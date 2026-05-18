#!/usr/bin/env node
import { readFileSync } from "node:fs";

const file = process.argv[2];
const input = file && file !== "-" ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
const events = input.split(/\r?\n/).filter(Boolean).map((line, index) => {
  try {
    return JSON.parse(line);
  } catch (err) {
    throw new Error(`Invalid JSONL at line ${index + 1}: ${err instanceof Error ? err.message : String(err)}`);
  }
});

const findings = events.filter((event) => event.type === "finding");
const tools = events.filter((event) => event.type === "tool_result");
const errors = events.filter((event) => event.type === "error");
const complete = [...events].reverse().find((event) => event.type === "complete");
const bySeverity = new Map();
for (const finding of findings) bySeverity.set(finding.severity, (bySeverity.get(finding.severity) ?? 0) + 1);
const blockingFindings = findings.filter((finding) => finding.severity === "critical" || finding.severity === "major");
const blockingTools = tools.filter((tool) => tool.blocking !== false && !tool.passed);

const lines = [];
lines.push(`crx JSONL summary: ${findings.length} finding(s), ${tools.length} tool result(s), ${errors.length} error(s).`);
if (complete?.summary) lines.push(`Complete: ${complete.summary}`);
if (findings.length) {
  lines.push(`Findings by severity: ${["critical", "major", "minor", "trivial", "info"].map((severity) => `${severity}=${bySeverity.get(severity) ?? 0}`).join(", ")}`);
}
if (blockingFindings.length) {
  lines.push("Blocking findings:");
  for (const finding of blockingFindings) lines.push(`- ${finding.severity} ${finding.fileName ?? "(unknown)"}: ${finding.title ?? finding.message ?? "untitled"}`);
}
if (blockingTools.length) {
  lines.push("Blocking tool failures:");
  for (const tool of blockingTools) lines.push(`- ${tool.name}: exit ${tool.exitCode}${tool.timedOut ? " (timed out)" : ""}`);
}
if (errors.length) {
  lines.push("Errors:");
  for (const error of errors) lines.push(`- ${error.message ?? "unknown error"}`);
}
console.log(lines.join("\n"));
process.exitCode = errors.length ? 1 : blockingFindings.length || blockingTools.length ? 3 : complete?.needsRerun ? 4 : 0;
