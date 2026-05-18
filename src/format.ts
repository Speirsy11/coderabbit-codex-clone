import { AGENT_PROTOCOL_VERSION, AGENT_SCHEMA_VERSION } from "./protocol.js";
import { assertAgentEvent } from "./agent-events.js";
import type { AgentEvent, Finding } from "./types.js";

const order = ["critical", "major", "minor", "trivial", "info"] as const;

export function formatJsonl(events: AgentEvent[]): string {
  return events
    .map((event) => {
      const withVersion = withProtocol(event);
      assertAgentEvent(withVersion);
      return JSON.stringify(withVersion);
    })
    .join("\n") + "\n";
}

function withProtocol(event: AgentEvent): AgentEvent {
  if ("protocolVersion" in event && "schemaVersion" in event) return event;
  return { ...event, protocolVersion: AGENT_PROTOCOL_VERSION, schemaVersion: AGENT_SCHEMA_VERSION } as AgentEvent;
}

export function formatPlain(findings: Finding[], context: { truncated: boolean; diffBytes: number }): string {
  const lines: string[] = [];
  lines.push(`CRX review complete: ${findings.length} finding${findings.length === 1 ? "" : "s"}.`);
  lines.push(`Diff size: ${context.diffBytes} bytes${context.truncated ? " (truncated before review)" : ""}.`);
  if (!findings.length) {
    lines.push("");
    lines.push("No actionable findings returned.");
    return lines.join("\n");
  }
  for (const severity of order) {
    const group = findings.filter((f) => f.severity === severity);
    if (!group.length) continue;
    lines.push("");
    lines.push(`${severity.toUpperCase()}`);
    for (const finding of group) {
      const loc = finding.lineStart ? `:${finding.lineStart}${finding.lineEnd && finding.lineEnd !== finding.lineStart ? `-${finding.lineEnd}` : ""}` : "";
      lines.push(`- ${finding.fileName}${loc} ${finding.title}`);
      lines.push(`  ${finding.message}`);
      lines.push(`  Impact: ${finding.impact}`);
      lines.push(`  Fix: ${finding.codegenInstructions}`);
      if (finding.suggestions.length) lines.push(`  Suggestions: ${finding.suggestions.join("; ")}`);
    }
  }
  lines.push("");
  lines.push("Fix critical and major issues first, then rerun `crx --agent` once before commit.");
  return lines.join("\n");
}
