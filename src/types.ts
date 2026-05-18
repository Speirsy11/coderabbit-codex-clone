export type Severity = "critical" | "major" | "minor" | "trivial" | "info";
export type FindingCategory = "potential_issue" | "refactor_suggestion" | "nitpick";

export type ReviewType = "all" | "committed" | "uncommitted";
export type ReviewProfile = "chill" | "assertive";

export interface Finding {
  type: "finding";
  severity: Severity;
  category?: FindingCategory;
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
  configSource?: string;
  untrackedFiles?: string[];
  skippedUntrackedFiles?: string[];
  excludedFiles?: string[];
  instructionFiles?: string[];
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
  blockingFindingsCount?: number;
  blockingToolsCount?: number;
  exitCode?: number;
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
  changedFiles?: string[];
  needsRerun?: boolean;
  rerunCommand?: string;
}

export interface WorktreeStatusEvent {
  type: "worktree_status";
  protocolVersion?: string;
  schemaVersion?: string;
  phase: "before_autofix" | "after_autofix";
  dirty: boolean;
  entries: string[];
}

export interface ToolResultEvent {
  type: "tool_result";
  protocolVersion?: string;
  schemaVersion?: string;
  name: string;
  command: string[];
  exitCode: number;
  durationMs: number;
  passed: boolean;
  blocking: boolean;
  timedOut?: boolean;
  severity?: Severity;
  stdout?: string;
  stderr?: string;
}

export interface ErrorEvent {
  type: "error";
  protocolVersion?: string;
  schemaVersion?: string;
  message: string;
  details?: string;
}

export type AgentEvent = ReviewContextEvent | StatusEvent | WarningEvent | Finding | CompleteEvent | AutoFixEvent | WorktreeStatusEvent | ToolResultEvent | ErrorEvent;

export interface LocalToolConfig {
  name: string;
  command: string | string[];
  enabled?: boolean;
  blocking?: boolean;
  timeoutMs?: number;
  outputLimit?: number;
  failureSeverity?: Severity;
}

export interface CrxConfig {
  codexCommand?: string;
  reviewPreferences?: string[];
  maxDiffBytes?: number;
  reviewProfile?: ReviewProfile;
  pathFilters?: string[];
  pathInstructions?: { pattern: string; instructions: string | string[] }[];
  codeGuidelines?: { filePatterns?: string[] };
  localTools?: LocalToolConfig[];
}

export interface ReviewOptions {
  dir: string;
  type: ReviewType;
  base?: string;
  baseCommit?: string;
  configFiles: string[];
  color: boolean;
  maxDiffBytes: number;
  reviewProfile?: ReviewProfile;
  mode: "plain" | "agent" | "interactive";
  fix: boolean;
  pathFilters?: string[];
}
