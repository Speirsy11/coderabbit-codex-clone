import type { AgentEvent, Finding, ToolResultEvent } from "./types.js";

const severities = ["critical", "major", "minor", "trivial", "info"] as const;

export function summarizeAgentJsonl(input: string): string {
  const events = parseAgentJsonl(input);
  const findings = events.filter((event): event is Finding => event.type === "finding");
  const tools = events.filter((event): event is ToolResultEvent => event.type === "tool_result");
  const failedTools = tools.filter((tool) => !tool.passed);
  const blockingTools = failedTools.filter((tool) => tool.blocking !== false);
  const complete = [...events].reverse().find((event) => event.type === "complete");
  const errors = events.filter((event) => event.type === "error");
  const counts = Object.fromEntries(severities.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length]));

  const lines = ["CRX JSONL summary"];
  lines.push(`Findings: ${findings.length} (${severities.map((severity) => `${severity} ${counts[severity]}`).join(", ")})`);
  lines.push(`Local tools: ${tools.length} run, ${failedTools.length} failed, ${blockingTools.length} blocking failure(s)`);
  if (complete?.type === "complete") lines.push(`Complete: ${complete.summary}`);
  if (errors.length) lines.push(`Errors: ${errors.map((event) => event.message).join("; ")}`);

  const blockingFindings = findings.filter((finding) => finding.severity === "critical" || finding.severity === "major");
  if (blockingFindings.length) {
    lines.push("");
    lines.push("Blocking findings:");
    for (const finding of blockingFindings) lines.push(`- ${finding.severity.toUpperCase()} ${location(finding)} ${finding.title}`);
  }

  if (blockingTools.length) {
    lines.push("");
    lines.push("Blocking tool failures:");
    for (const tool of blockingTools) lines.push(`- ${tool.name}: exit ${tool.exitCode}${tool.timedOut ? " (timed out)" : ""}`);
  }

  return `${lines.join("\n")}\n`;
}

export function parseAgentJsonl(input: string): AgentEvent[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as AgentEvent;
      } catch (err) {
        throw new Error(`Invalid JSONL on line ${index + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
}

function location(finding: Finding): string {
  const line = finding.lineStart ? `:${finding.lineStart}${finding.lineEnd && finding.lineEnd !== finding.lineStart ? `-${finding.lineEnd}` : ""}` : "";
  return `${finding.fileName}${line}`;
}
