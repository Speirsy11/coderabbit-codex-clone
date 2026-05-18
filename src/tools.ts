import { spawn } from "node:child_process";
import { splitCommand } from "./command.js";
import type { LocalToolConfig, Severity, ToolResultEvent } from "./types.js";
import { AGENT_PROTOCOL_VERSION, AGENT_SCHEMA_VERSION } from "./protocol.js";

const DEFAULT_TOOL_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_OUTPUT_LIMIT = 12000;

export async function runLocalTools(tools: LocalToolConfig[] | undefined, cwd: string): Promise<ToolResultEvent[]> {
  const configured = tools ?? [];
  const results: ToolResultEvent[] = [];
  for (const tool of configured) {
    if (tool.enabled === false) continue;
    results.push(await runLocalTool(tool, cwd));
  }
  return results;
}

export async function runLocalTool(tool: LocalToolConfig, cwd: string): Promise<ToolResultEvent> {
  const argv = Array.isArray(tool.command) ? tool.command : splitCommand(tool.command);
  const [cmd, ...args] = argv;
  if (!tool.name?.trim()) throw new Error("Local tool config requires a non-empty name.");
  if (!cmd) throw new Error(`Local tool ${tool.name} requires a command.`);
  const started = Date.now();
  const timeoutMs = positiveInt(tool.timeoutMs) ?? DEFAULT_TOOL_TIMEOUT_MS;
  const outputLimit = positiveInt(tool.outputLimit) ?? DEFAULT_OUTPUT_LIMIT;

  const result = await runCommand(cmd, args, cwd, timeoutMs, outputLimit);
  const durationMs = Date.now() - started;
  return {
    type: "tool_result",
    protocolVersion: AGENT_PROTOCOL_VERSION,
    schemaVersion: AGENT_SCHEMA_VERSION,
    name: tool.name,
    command: argv,
    exitCode: result.exitCode,
    durationMs,
    passed: result.exitCode === 0,
    blocking: tool.blocking !== false,
    timedOut: result.timedOut,
    severity: result.exitCode === 0 ? undefined : toolFailureSeverity(tool),
    stdout: result.stdout,
    stderr: result.stderr
  };
}

export function renderToolResultsForPrompt(results: ToolResultEvent[]): string {
  if (!results.length) return "(none)";
  return results
    .map((result) => {
      const status = result.passed ? "passed" : result.timedOut ? "timed out" : `failed with exit ${result.exitCode}`;
      const stdout = result.stdout?.trim() ? `\nstdout:\n${result.stdout.trim()}` : "";
      const stderr = result.stderr?.trim() ? `\nstderr:\n${result.stderr.trim()}` : "";
      return `## ${result.name}\nCommand: ${result.command.join(" ")}\nStatus: ${status}${stdout}${stderr}`;
    })
    .join("\n\n");
}

export function hasBlockingToolFailures(results: ToolResultEvent[]): boolean {
  return results.some((result) => result.blocking !== false && !result.passed);
}

function toolFailureSeverity(tool: LocalToolConfig): Severity {
  if (tool.failureSeverity === "critical" || tool.failureSeverity === "major" || tool.failureSeverity === "minor" || tool.failureSeverity === "trivial" || tool.failureSeverity === "info") return tool.failureSeverity;
  return tool.blocking === false ? "minor" : "major";
}

function positiveInt(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function runCommand(cmd: string, args: string[], cwd: string, timeoutMs: number, outputLimit: number): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    const append = (current: string, chunk: string) => `${current}${chunk}`.slice(-outputLimit);
    const settle = (value: { exitCode: number; stdout: string; stderr: string; timedOut: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout = append(stdout, chunk)));
    child.stderr.on("data", (chunk) => (stderr = append(stderr, chunk)));
    child.on("error", (err) => settle({ exitCode: 127, stdout, stderr: err.message, timedOut: false }));
    child.on("close", (code, signal) => settle({ exitCode: timedOut ? 124 : code ?? (signal ? 128 : 1), stdout, stderr, timedOut }));
  });
}
