import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { formatPlain } from "./format.js";
import type { AutoFixResult } from "./autofix.js";
import type { Finding, ReviewContextEvent } from "./types.js";

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class ReviewTui {
  private timer: NodeJS.Timeout | undefined;
  private frame = 0;
  private message = "Starting";
  private enabled: boolean;
  private statusToStderr: boolean;

  constructor(enabled = process.stdout.isTTY, statusToStderr = true) {
    this.enabled = enabled;
    this.statusToStderr = statusToStderr;
  }

  start(message: string): void {
    this.message = message;
    if (!this.enabled) {
      if (this.statusToStderr) console.error(`crx: ${message}`);
      return;
    }
    this.timer = setInterval(() => this.renderSpinner(), 80);
  }

  status(message: string): void {
    this.message = message;
    if (!this.enabled && this.statusToStderr) console.error(`crx: ${message}`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.enabled) {
      output.clearLine(0);
      output.cursorTo(0);
    }
  }

  render(findings: Finding[], context: ReviewContextEvent): void {
    this.stop();
    output.write(renderTuiSummary(findings, context));
  }

  private renderSpinner(): void {
    output.clearLine(0);
    output.cursorTo(0);
    output.write(`${spinnerFrames[this.frame++ % spinnerFrames.length]} ${this.message}`);
  }
}

export function renderTuiSummary(findings: Finding[], context: ReviewContextEvent): string {
  const counts = countBySeverity(findings);
  const lines = [
    "\n╭──────────────────────────────╮",
    "│ crx Codex review             │",
    "╰──────────────────────────────╯",
    `Repo: ${context.repoDir}`,
    `Review: ${context.reviewType} • diff ${context.diffBytes} bytes${context.truncated ? " • truncated" : ""}`,
    `Findings: ${findings.length}  critical ${counts.critical} • major ${counts.major} • minor ${counts.minor} • trivial ${counts.trivial} • info ${counts.info}`,
    "",
    formatPlain(findings, context),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

export async function askAutoFix(findings: Finding[], requested: boolean): Promise<boolean> {
  if (requested) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY || !findings.length) return false;
  const actionable = findings.some((finding) => finding.severity === "critical" || finding.severity === "major");
  if (!actionable) return false;
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("Apply Codex auto-fix for critical/major findings? [y/N] ");
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

export function renderAutoFixResult(result: AutoFixResult): string {
  const icon = result.applied ? "✓" : "!";
  const rerun = result.applied ? " Rerun crx review before treating the gate as passed." : "";
  return `${icon} Auto-fix: ${result.summary}${rerun}`;
}

function countBySeverity(findings: Finding[]): Record<Finding["severity"], number> {
  return findings.reduce(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { critical: 0, major: 0, minor: 0, trivial: 0, info: 0 }
  );
}
