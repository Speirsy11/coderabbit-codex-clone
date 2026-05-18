import { AGENT_PROTOCOL_VERSION, AGENT_SCHEMA_VERSION } from "./protocol.js";
import type { AgentEvent } from "./types.js";

export function assertAgentEvent(event: AgentEvent): void {
  const errors = validateAgentEvent(event);
  if (errors.length) throw new Error(`Invalid agent event ${JSON.stringify(event.type)}: ${errors.join("; ")}`);
}

export function validateAgentEvent(event: AgentEvent): string[] {
  const errors: string[] = [];
  const value = event as unknown as Record<string, unknown>;
  if (value.protocolVersion !== AGENT_PROTOCOL_VERSION) errors.push(`protocolVersion must be ${AGENT_PROTOCOL_VERSION}`);
  if (value.schemaVersion !== AGENT_SCHEMA_VERSION) errors.push(`schemaVersion must be ${AGENT_SCHEMA_VERSION}`);

  switch (event.type) {
    case "status":
      requireString(value, "message", errors);
      break;
    case "review_context":
      requireString(value, "repoDir", errors);
      requireOneOf(value, "reviewType", ["all", "committed", "uncommitted"], errors);
      requireNumber(value, "diffBytes", errors, { integer: true, min: 0 });
      requireBoolean(value, "truncated", errors);
      requireStringArray(value, "configFiles", errors);
      optionalString(value, "configSource", errors);
      optionalStringArray(value, "instructionFiles", errors);
      optionalStringArray(value, "untrackedFiles", errors);
      optionalStringArray(value, "skippedUntrackedFiles", errors);
      optionalStringArray(value, "excludedFiles", errors);
      break;
    case "warning":
      requireString(value, "message", errors);
      optionalStringArray(value, "files", errors);
      break;
    case "finding":
      requireOneOf(value, "severity", ["critical", "major", "minor", "trivial", "info"], errors);
      optionalOneOf(value, "category", ["potential_issue", "refactor_suggestion", "nitpick"], errors);
      requireString(value, "fileName", errors);
      optionalPositiveInteger(value, "lineStart", errors);
      optionalPositiveInteger(value, "lineEnd", errors);
      requireString(value, "title", errors);
      requireString(value, "message", errors);
      requireString(value, "impact", errors);
      requireString(value, "codegenInstructions", errors);
      requireStringArray(value, "suggestions", errors);
      break;
    case "tool_result":
      requireString(value, "name", errors);
      requireStringArray(value, "command", errors, { minItems: 1 });
      requireNumber(value, "exitCode", errors, { integer: true });
      requireNumber(value, "durationMs", errors, { integer: true, min: 0 });
      requireBoolean(value, "passed", errors);
      requireBoolean(value, "blocking", errors);
      optionalBoolean(value, "timedOut", errors);
      optionalOneOf(value, "severity", ["critical", "major", "minor", "trivial", "info"], errors);
      optionalString(value, "stdout", errors);
      optionalString(value, "stderr", errors);
      break;
    case "worktree_status":
      requireOneOf(value, "phase", ["before_autofix", "after_autofix"], errors);
      requireBoolean(value, "dirty", errors);
      requireStringArray(value, "entries", errors);
      break;
    case "autofix":
      requireBoolean(value, "applied", errors);
      requireString(value, "summary", errors);
      optionalStringArray(value, "changedFiles", errors);
      optionalBoolean(value, "needsRerun", errors);
      optionalString(value, "rerunCommand", errors);
      break;
    case "complete":
      requireNumber(value, "findingsCount", errors, { integer: true, min: 0 });
      optionalNonNegativeInteger(value, "blockingFindingsCount", errors);
      optionalNonNegativeInteger(value, "blockingToolsCount", errors);
      requireString(value, "summary", errors);
      optionalBoolean(value, "autoFixApplied", errors);
      optionalBoolean(value, "needsRerun", errors);
      optionalString(value, "rerunCommand", errors);
      break;
    case "error":
      requireString(value, "message", errors);
      optionalString(value, "details", errors);
      break;
    default:
      errors.push(`unknown type ${(event as { type?: unknown }).type}`);
  }
  return errors;
}

function requireString(value: Record<string, unknown>, field: string, errors: string[]): void {
  if (typeof value[field] !== "string") errors.push(`${field} must be a string`);
}

function optionalString(value: Record<string, unknown>, field: string, errors: string[]): void {
  if (value[field] !== undefined && typeof value[field] !== "string") errors.push(`${field} must be a string`);
}

function requireBoolean(value: Record<string, unknown>, field: string, errors: string[]): void {
  if (typeof value[field] !== "boolean") errors.push(`${field} must be a boolean`);
}

function optionalBoolean(value: Record<string, unknown>, field: string, errors: string[]): void {
  if (value[field] !== undefined && typeof value[field] !== "boolean") errors.push(`${field} must be a boolean`);
}

function requireNumber(value: Record<string, unknown>, field: string, errors: string[], options: { integer?: boolean; min?: number } = {}): void {
  const n = value[field];
  if (typeof n !== "number" || !Number.isFinite(n)) {
    errors.push(`${field} must be a number`);
    return;
  }
  if (options.integer && !Number.isInteger(n)) errors.push(`${field} must be an integer`);
  if (options.min !== undefined && n < options.min) errors.push(`${field} must be >= ${options.min}`);
}

function optionalNonNegativeInteger(value: Record<string, unknown>, field: string, errors: string[]): void {
  if (value[field] === undefined) return;
  requireNumber(value, field, errors, { integer: true, min: 0 });
}

function optionalPositiveInteger(value: Record<string, unknown>, field: string, errors: string[]): void {
  if (value[field] === undefined) return;
  requireNumber(value, field, errors, { integer: true, min: 1 });
}

function requireStringArray(value: Record<string, unknown>, field: string, errors: string[], options: { minItems?: number } = {}): void {
  const array = value[field];
  if (!Array.isArray(array) || array.some((item) => typeof item !== "string")) {
    errors.push(`${field} must be an array of strings`);
    return;
  }
  if (options.minItems !== undefined && array.length < options.minItems) errors.push(`${field} must contain at least ${options.minItems} item(s)`);
}

function optionalStringArray(value: Record<string, unknown>, field: string, errors: string[]): void {
  if (value[field] !== undefined) requireStringArray(value, field, errors);
}

function optionalOneOf(value: Record<string, unknown>, field: string, allowed: string[], errors: string[]): void {
  if (value[field] === undefined) return;
  requireOneOf(value, field, allowed, errors);
}

function requireOneOf(value: Record<string, unknown>, field: string, allowed: string[], errors: string[]): void {
  if (typeof value[field] !== "string" || !allowed.includes(value[field] as string)) errors.push(`${field} must be one of ${allowed.join(", ")}`);
}
