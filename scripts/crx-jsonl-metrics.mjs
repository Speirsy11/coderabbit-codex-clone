#!/usr/bin/env node
import { readFileSync } from "node:fs";

const severities = ["critical", "major", "minor", "trivial", "info"];
const categories = ["potential_issue", "refactor_suggestion", "nitpick"];
const file = process.argv[2];
const input = file && file !== "-" ? readFileSync(file, "utf8") : readFileSync(0, "utf8");

let events;
try {
  events = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSONL at line ${index + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const findings = events.filter((event) => event.type === "finding");
const tools = events.filter((event) => event.type === "tool_result");
const errors = events.filter((event) => event.type === "error");
const complete = [...events].reverse().find((event) => event.type === "complete");
const failedTools = tools.filter((tool) => !tool.passed);
const blockingTools = failedTools.filter((tool) => tool.blocking !== false);
const blockingFindings = findings.filter((finding) => finding.severity === "critical" || finding.severity === "major");
const changedFileStats = events.flatMap((event) => event.type === "review_context" ? event.changedFileStats ?? [] : []);
const excludedFileStats = events.flatMap((event) => event.type === "review_context" ? event.excludedFileStats ?? [] : []);

const metrics = {
  findings: {
    total: findings.length,
    bySeverity: Object.fromEntries(severities.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])),
    byCategory: Object.fromEntries([
      ...categories.map((category) => [category, findings.filter((finding) => finding.category === category).length]),
      ["uncategorized", findings.filter((finding) => !finding.category).length]
    ]),
    blocking: blockingFindings.length
  },
  changedFiles: fileStatMetrics(changedFileStats),
  excludedFiles: fileStatMetrics(excludedFileStats),
  localTools: {
    total: tools.length,
    failed: failedTools.length,
    blockingFailures: blockingTools.length,
    timedOut: tools.filter((tool) => tool.timedOut).length,
    byPhase: {
      pre_review: tools.filter((tool) => !tool.phase || tool.phase === "pre_review").length,
      post_autofix: tools.filter((tool) => tool.phase === "post_autofix").length
    }
  },
  complete: complete ? {
    summary: complete.summary,
    exitCode: complete.exitCode,
    needsRerun: complete.needsRerun,
    autoFixApplied: complete.autoFixApplied
  } : undefined,
  errors: errors.map((event) => event.message ?? "unknown error"),
  exitCode: errors.length ? 1 : typeof complete?.exitCode === "number" ? complete.exitCode : blockingFindings.length || blockingTools.length ? 3 : complete?.needsRerun ? 4 : 0
};

function fileStatMetrics(stats) {
  return {
    total: stats.length,
    additions: stats.reduce((sum, stat) => sum + stat.additions, 0),
    deletions: stats.reduce((sum, stat) => sum + stat.deletions, 0),
    byStatus: {
      added: stats.filter((stat) => stat.status === "added").length,
      modified: stats.filter((stat) => stat.status === "modified").length,
      deleted: stats.filter((stat) => stat.status === "deleted").length,
      renamed: stats.filter((stat) => stat.status === "renamed").length
    }
  };
}

console.log(JSON.stringify(metrics, null, 2));
process.exitCode = metrics.exitCode;
