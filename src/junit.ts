import type { Finding, ToolResultEvent } from "./types.js";
import { parseAgentJsonl } from "./summary.js";

export function agentJsonlToJunit(input: string): string {
  const events = parseAgentJsonl(input);
  const findings = events.filter((event): event is Finding => event.type === "finding");
  const tools = events.filter((event): event is ToolResultEvent => event.type === "tool_result");
  const blockingFindings = findings.filter((finding) => finding.severity === "critical" || finding.severity === "major");
  const blockingTools = tools.filter((tool) => tool.blocking !== false && !tool.passed);
  const cases = [
    ...blockingFindings.map((finding) => testCase(`finding:${finding.fileName}:${finding.title}`, failureMessage(finding), `${finding.impact}\n\nFix: ${finding.codegenInstructions}`)),
    ...blockingTools.map((tool) => testCase(`tool:${tool.name}`, `${(tool.severity ?? "major").toUpperCase()} local tool ${tool.name} failed with exit ${tool.exitCode}${tool.timedOut ? " (timed out)" : ""}.`, [tool.stdout, tool.stderr].filter(Boolean).join("\n")))
  ];
  const tests = cases.length || 1;
  const fallback = cases.length ? "" : testCase("crx:pass");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="crx" tests="${tests}" failures="${cases.length}">\n${cases.join("")}${fallback}</testsuite>\n`;
}

function testCase(name: string, failure?: string, details = ""): string {
  const body = failure ? `    <failure message="${escapeXml(failure)}">${escapeXml(details || failure)}</failure>\n` : "";
  return `  <testcase classname="crx" name="${escapeXml(name)}">\n${body}  </testcase>\n`;
}

function failureMessage(finding: Finding): string {
  return `${finding.severity.toUpperCase()} ${finding.fileName}${finding.lineStart ? `:${finding.lineStart}` : ""} ${finding.title}: ${finding.message}`;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&apos;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
