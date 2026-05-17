export type Severity = "critical" | "major" | "minor" | "trivial" | "info";

export type ReviewType = "all" | "committed" | "uncommitted";

export interface Finding {
  type: "finding";
  severity: Severity;
  fileName: string;
  lineStart?: number;
  lineEnd?: number;
  title: string;
  message: string;
  impact: string;
  codegenInstructions: string;
  suggestions: string[];
}

export interface ReviewContextEvent {
  type: "review_context";
  repoDir: string;
  reviewType: ReviewType;
  base?: string;
  baseCommit?: string;
  diffBytes: number;
  truncated: boolean;
  configFiles: string[];
}

export interface StatusEvent {
  type: "status";
  message: string;
}

export interface CompleteEvent {
  type: "complete";
  findingsCount: number;
  summary: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  details?: string;
}

export type AgentEvent = ReviewContextEvent | StatusEvent | Finding | CompleteEvent | ErrorEvent;

export interface CrxConfig {
  codexCommand?: string;
  reviewPreferences?: string[];
  maxDiffBytes?: number;
}

export interface ReviewOptions {
  dir: string;
  type: ReviewType;
  base?: string;
  baseCommit?: string;
  configFiles: string[];
  color: boolean;
  maxDiffBytes: number;
  mode: "plain" | "agent" | "interactive";
}
