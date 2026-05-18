import type { Finding, FindingCategory, Severity } from "./types.js";

const severities: Severity[] = ["critical", "major", "minor", "trivial", "info"];
const categories: FindingCategory[] = ["potential_issue", "refactor_suggestion", "nitpick"];

export function parseCodexFindings(output: string): Finding[] {
  const candidates = jsonCandidates(output);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const rawFindings = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { findings?: unknown }).findings)
          ? (parsed as { findings: unknown[] }).findings
          : undefined;
      if (rawFindings) return rawFindings.map(validateFinding).filter(Boolean) as Finding[];
    } catch {
      continue;
    }
  }
  throw new Error("Codex returned no valid JSON findings array.");
}

function jsonCandidates(output: string): string[] {
  const fenced = [...output.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1].trim());
  const trimmed = output.trim();
  const firstArray = sliceBetween(trimmed, "[", "]");
  const firstObject = sliceBetween(trimmed, "{", "}");
  return [trimmed, ...fenced, firstArray, firstObject].filter((v): v is string => Boolean(v));
}

function sliceBetween(input: string, open: string, close: string): string | undefined {
  const start = input.indexOf(open);
  const end = input.lastIndexOf(close);
  return start >= 0 && end > start ? input.slice(start, end + 1) : undefined;
}

function validateFinding(value: unknown): Finding | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const severity = severities.includes(v.severity as Severity) ? (v.severity as Severity) : "info";
  const fileName = stringValue(v.fileName);
  const title = stringValue(v.title);
  const message = stringValue(v.message);
  if (!fileName || !title || !message) return undefined;
  return {
    type: "finding",
    severity,
    category: categories.includes(v.category as FindingCategory) ? (v.category as FindingCategory) : defaultCategory(severity),
    fileName,
    lineStart: numberValue(v.lineStart),
    lineEnd: numberValue(v.lineEnd),
    title,
    message,
    impact: stringValue(v.impact) || "Not specified.",
    codegenInstructions: stringValue(v.codegenInstructions) || "Inspect and fix this issue.",
    suggestions: Array.isArray(v.suggestions) ? v.suggestions.map(String) : []
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function defaultCategory(severity: Severity): FindingCategory {
  return severity === "critical" || severity === "major" ? "potential_issue" : "nitpick";
}
