import type { Finding } from "./types.js";
import { parseAgentJsonl } from "./summary.js";

export function agentJsonlToSarif(input: string): string {
  const events = parseAgentJsonl(input);
  const findings = events.filter((event): event is Finding => event.type === "finding");
  const rules = [...new Map(findings.map((finding) => [ruleId(finding), sarifRule(finding)])).values()];
  const results = findings.map((finding) => ({
    ruleId: ruleId(finding),
    level: sarifLevel(finding.severity),
    message: { text: `${finding.title}: ${finding.message}` },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.fileName },
          ...(finding.lineStart ? { region: { startLine: finding.lineStart, ...(finding.lineEnd ? { endLine: finding.lineEnd } : {}) } } : {})
        }
      }
    ],
    properties: {
      severity: finding.severity,
      category: finding.category ?? defaultCategory(finding),
      impact: finding.impact,
      codegenInstructions: finding.codegenInstructions,
      suggestions: finding.suggestions ?? []
    }
  }));
  return `${JSON.stringify({
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "crx",
            informationUri: "https://github.com/Speirsy11/coderabbit-codex-clone",
            rules
          }
        },
        results
      }
    ]
  }, null, 2)}\n`;
}

function ruleId(finding: Finding): string {
  return `crx/${finding.category ?? defaultCategory(finding)}/${finding.severity}`;
}

function sarifRule(finding: Finding): object {
  const category = finding.category ?? defaultCategory(finding);
  return {
    id: ruleId(finding),
    name: category,
    shortDescription: { text: `${category} (${finding.severity})` },
    properties: { category, severity: finding.severity }
  };
}

function sarifLevel(severity: Finding["severity"]): "error" | "warning" | "note" {
  if (severity === "critical" || severity === "major") return "error";
  if (severity === "minor") return "warning";
  return "note";
}

function defaultCategory(finding: Finding): NonNullable<Finding["category"]> {
  return finding.severity === "critical" || finding.severity === "major" ? "potential_issue" : "nitpick";
}
