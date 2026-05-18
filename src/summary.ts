import type { AgentEvent, Finding, FindingCategory, Severity, ToolResultEvent } from "./types.js";

const severities: Severity[] = ["critical", "major", "minor", "trivial", "info"];
const categories: FindingCategory[] = ["potential_issue", "refactor_suggestion", "nitpick"];

export function summarizeAgentJsonl(input: string): string {
  const events = parseAgentJsonl(input);
  const { findings, tools, failedTools, blockingTools, complete, errors } = analyzeAgentEvents(events);
  const counts = Object.fromEntries(severities.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length]));

  const lines = ["CRX JSONL summary"];
  lines.push(`Findings: ${findings.length} (${severities.map((severity) => `${severity} ${counts[severity]}`).join(", ")})`);
  lines.push(`Local tools: ${tools.length} run, ${failedTools.length} failed, ${blockingTools.length} blocking failure(s)`);
  if (complete?.type === "complete") lines.push(`Complete: ${complete.summary}`);
  if (errors.length) lines.push(`Errors: ${errors.map((event) => event.message).join("; ")}`);

  const blockingFindings = findings.filter(isBlockingFinding);
  if (blockingFindings.length) {
    lines.push("");
    lines.push("Blocking findings:");
    for (const finding of blockingFindings) lines.push(`- ${finding.severity.toUpperCase()} ${location(finding)} ${finding.title}`);
  }

  if (blockingTools.length) {
    lines.push("");
    lines.push("Blocking tool failures:");
    for (const tool of blockingTools) lines.push(`- ${(tool.severity ?? "major").toUpperCase()} ${tool.name}: exit ${tool.exitCode}${tool.timedOut ? " (timed out)" : ""}`);
  }

  return `${lines.join("\n")}\n`;
}

export interface AgentJsonlMetrics {
  findings: { total: number; bySeverity: Record<Severity, number>; byCategory: Record<FindingCategory | "uncategorized", number>; blocking: number };
  localTools: { total: number; failed: number; blockingFailures: number; timedOut: number; byPhase: Record<"pre_review" | "post_autofix", number> };
  complete?: { summary: string; exitCode?: number; needsRerun?: boolean; autoFixApplied?: boolean };
  errors: string[];
  exitCode: number;
}

export function summarizeAgentJsonlMetrics(input: string): AgentJsonlMetrics {
  const events = parseAgentJsonl(input);
  const { findings, tools, failedTools, blockingTools, complete, errors } = analyzeAgentEvents(events);
  const bySeverity = Object.fromEntries(severities.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])) as Record<Severity, number>;
  const byCategory = Object.fromEntries([
    ...categories.map((category) => [category, findings.filter((finding) => finding.category === category).length] as const),
    ["uncategorized", findings.filter((finding) => !finding.category).length] as const
  ]) as Record<FindingCategory | "uncategorized", number>;
  return {
    findings: { total: findings.length, bySeverity, byCategory, blocking: findings.filter(isBlockingFinding).length },
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
    complete: complete?.type === "complete" ? { summary: complete.summary, exitCode: complete.exitCode, needsRerun: complete.needsRerun, autoFixApplied: complete.autoFixApplied } : undefined,
    errors: errors.map((event) => event.message),
    exitCode: agentJsonlExitCode(input)
  };
}

export function summarizeAgentJsonlJson(input: string): string {
  return `${JSON.stringify(summarizeAgentJsonlMetrics(input), null, 2)}\n`;
}

export function agentJsonlExitCode(input: string): number {
  const events = parseAgentJsonl(input);
  const { findings, tools, blockingTools, complete, errors } = analyzeAgentEvents(events);
  const blockingFindings = findings.filter(isBlockingFinding);
  if (errors.length) return 1;
  if (complete?.type === "complete" && typeof complete.exitCode === "number") return complete.exitCode;
  if (blockingFindings.length || blockingTools.length) return 3;
  if (complete?.type === "complete" && complete.needsRerun) return 4;
  return 0;
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

function analyzeAgentEvents(events: AgentEvent[]) {
  const findings = events.filter((event): event is Finding => event.type === "finding");
  const tools = events.filter((event): event is ToolResultEvent => event.type === "tool_result");
  const failedTools = tools.filter((tool) => !tool.passed);
  const blockingTools = failedTools.filter((tool) => tool.blocking !== false);
  const complete = [...events].reverse().find((event) => event.type === "complete");
  const errors = events.filter((event) => event.type === "error");
  return { findings, tools, failedTools, blockingTools, complete, errors };
}

function isBlockingFinding(finding: Finding): boolean {
  return finding.severity === "critical" || finding.severity === "major";
}

function location(finding: Finding): string {
  const line = finding.lineStart ? `:${finding.lineStart}${finding.lineEnd && finding.lineEnd !== finding.lineStart ? `-${finding.lineEnd}` : ""}` : "";
  return `${finding.fileName}${line}`;
}
