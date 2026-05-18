import type { CrxConfig, ReviewOptions } from "./types.js";

const MAX_INSTRUCTION_CONTEXT_CHARS = 30000;
const MAX_TOOL_CONTEXT_CHARS = 20000;

export function buildReviewPrompt(input: {
  options: ReviewOptions;
  diff: string;
  truncated: boolean;
  configText: string;
  pathInstructionText?: string;
  toolResultText?: string;
  config: CrxConfig;
}): string {
  const prefs = input.config.reviewPreferences?.map((p) => `- ${p}`).join("\n") || "- Focus on actionable correctness and security findings.";
  const profile = input.options.reviewProfile ?? input.config.reviewProfile ?? "chill";
  const profileInstruction = profile === "assertive"
    ? "Assertive: include concrete minor issues and maintainability risks when they are actionable and grounded in this diff."
    : "Chill: report only production-relevant issues; avoid nits, style-only comments, and low-confidence suggestions.";
  return `You are reviewing a local Git diff for a CodeRabbit-style CLI clone named crx.

Return ONLY JSON. Do not wrap it in markdown. Schema:
{
  "findings": [
    {
      "severity": "critical" | "major" | "minor" | "trivial" | "info",
      "category": "potential_issue" | "refactor_suggestion" | "nitpick",
      "fileName": "path/from/repo",
      "lineStart": 1,
      "lineEnd": 1,
      "title": "short title",
      "message": "specific explanation",
      "impact": "why this matters",
      "codegenInstructions": "precise fix instructions for an implementation agent",
      "suggestions": ["optional concrete suggestions"]
    }
  ]
}

Review profile: ${profile}
${profileInstruction}

Review preferences:
${prefs}

Additional instruction files:
${compactContext(input.configText, MAX_INSTRUCTION_CONTEXT_CHARS, "instruction context") || "(none)"}

Path-specific instructions for changed files:
${input.pathInstructionText || "(none)"}

Local tool results:
${compactContext(input.toolResultText, MAX_TOOL_CONTEXT_CHARS, "local tool context") || "(none)"}

Diff truncated: ${input.truncated ? "yes" : "no"}
Review type: ${input.options.type}

Review the diff below. Report only real, actionable issues introduced or exposed by this diff. Use category potential_issue for correctness/security/reliability risks, refactor_suggestion for maintainability improvements, and nitpick for low-priority style concerns.

${input.diff}`;
}

function compactContext(text: string | undefined, limit: number, label: string): string {
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[CRX_${label.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_TRUNCATED: original ${text.length} chars, shown ${limit} chars]`;
}
