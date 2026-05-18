import { spawn } from "node:child_process";
import type { CrxConfig, Finding } from "./types.js";

export interface AutoFixResult {
  applied: boolean;
  patch?: string;
  summary: string;
}

export function buildAutoFixPrompt(input: { findings: Finding[]; diff: string; truncated: boolean; config: CrxConfig }): string {
  const actionable = input.findings.filter((finding) => finding.severity === "critical" || finding.severity === "major");
  const selected = actionable.length ? actionable : input.findings;
  const findingsText = selected
    .map(
      (finding, index) => `${index + 1}. [${finding.severity}] ${finding.fileName}${finding.lineStart ? `:${finding.lineStart}` : ""}
Title: ${finding.title}
Problem: ${finding.message}
Fix instructions: ${finding.codegenInstructions}`
    )
    .join("\n\n");

  const prefs = input.config.reviewPreferences?.map((p) => `- ${p}`).join("\n") || "- Keep fixes minimal and targeted.";
  return `You are generating a safe auto-fix patch for a local Git diff reviewed by crx.

Return ONLY a unified diff patch that can be applied with git apply. Do not use markdown fences. Do not explain.

Rules:
- Fix only the listed findings.
- Prefer critical and major issues; do not rewrite unrelated code.
- Do not introduce dependencies unless the diff already makes that unavoidable.
- Preserve formatting style visible in the diff.
- If no safe patch can be generated, return an empty response.

Review preferences:
${prefs}

Diff truncated: ${input.truncated ? "yes" : "no"}

Findings to fix:
${findingsText || "(none)"}

Current diff:
${input.diff}`;
}

export function extractUnifiedDiff(output: string): string {
  const fenced = output.match(/```(?:diff|patch)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = (fenced || output).trim();
  const firstDiff = candidate.search(/^(diff --git|---\s|Index: )/m);
  return firstDiff >= 0 ? candidate.slice(firstDiff).trimEnd() + "\n" : "";
}

export async function applyPatch(repoDir: string, patch: string): Promise<AutoFixResult> {
  if (!patch.trim()) return { applied: false, summary: "Codex did not return an applicable patch." };
  const check = await runGitApply(repoDir, ["apply", "--check"], patch);
  if (check.code !== 0) return { applied: false, patch, summary: check.stderr || "Generated patch failed git apply --check." };
  const applied = await runGitApply(repoDir, ["apply"], patch);
  if (applied.code !== 0) return { applied: false, patch, summary: applied.stderr || "Generated patch failed during apply." };
  return { applied: true, patch, summary: "Applied Codex-generated patch." };
}

function runGitApply(cwd: string, args: string[], stdin: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: err.message }));
    child.stdin.end(stdin);
  });
}
