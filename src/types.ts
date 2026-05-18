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
  protocolVersion?: string;
  schemaVersion?: string;
  repoDir: string;
  reviewType: ReviewType;
  base?: string;
  baseCommit?: string;
  diffBytes: number;
  truncated: boolean;
  configFiles: string[];
  untrackedFiles?: string[];
  skippedUntrackedFiles?: string[];
}

export interface StatusEvent {
  type: "status";
  protocolVersion?: string;
  schemaVersion?: string;
  message: string;
}

export interface WarningEvent {
  type: "warning";
  protocolVersion?: string;
  schemaVersion?: string;
  message: string;
  files?: string[];
}

export interface CompleteEvent {
  type: "complete";
  protocolVersion?: string;
  schemaVersion?: string;
  findingsCount: number;
  summary: string;
  autoFixApplied?: boolean;
  needsRerun?: boolean;
  rerunCommand?: string;
}

export interface AutoFixEvent {
  type: "autofix";
  protocolVersion?: string;
  schemaVersion?: string;
  applied: boolean;
  summary: string;
  needsRerun?: boolean;
  rerunCommand?: string;
}

export interface ErrorEvent {
  type: "error";
  protocolVersion?: string;
  schemaVersion?: string;
  message: string;
  details?: string;
}

export type AgentEvent = ReviewContextEvent | StatusEvent | WarningEvent | Finding | CompleteEvent | AutoFixEvent | ErrorEvent;

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
  fix: boolean;
}
