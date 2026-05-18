#!/usr/bin/env node
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { applyPatch, buildAutoFixPrompt, extractUnifiedDiff } from "./autofix.js";
import { codexAuthStatus, runCodexExec } from "./codex.js";
import { CONFIG_NAME, initConfig, loadConfig } from "./config.js";
import { formatJsonl, formatPlain } from "./format.js";
import { assertGitRepo, collectDiff, worktreeStatus } from "./git.js";
import { parseCodexFindings } from "./parser.js";
import { AGENT_PROTOCOL_VERSION, AGENT_SCHEMA_VERSION } from "./protocol.js";
import { buildReviewPrompt } from "./prompt.js";
import { redactSecrets } from "./redact.js";
import { effectiveGuidelineFiles, effectivePathFilters, filesFromDiff, renderPathInstructions } from "./scope.js";
import { summarizeAgentJsonl } from "./summary.js";
import { hasBlockingToolFailures, renderToolResultsForPrompt, runLocalTools } from "./tools.js";
import { askAutoFix, renderAutoFixResult, ReviewTui } from "./tui.js";
import type { AgentEvent, ReviewContextEvent, ReviewOptions, ReviewProfile, ReviewType } from "./types.js";

const DEFAULT_MAX_DIFF_BYTES = 180000;

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith("-") ? args.shift()! : "review";
  try {
    if ((command === "review" && (args[0] === "--help" || args[0] === "-h")) || command === "--help" || command === "-h") {
      printHelp();
      return 0;
    }
    if (command === "review") return await review(args);
    if (command === "summarize") return await summarize(args);
    if (command === "auth" && args[0] === "status") return await authStatus();
    if (command === "config" && args[0] === "init") return await configInit(args.slice(1));
    if (command === "help" || command === "--help" || command === "-h") {
      printHelp();
      return 0;
    }
    throw new Error(`Unknown command: ${command}`);
  } catch (err) {
    console.error(`crx: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

async function review(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return 0;
  }
  const options = parseReviewArgs(args);
  const tui = new ReviewTui(options.mode === "interactive", options.mode !== "agent");
  const repoDir = await assertGitRepo(options.dir);
  options.dir = repoDir;
  const config = await loadConfig(repoDir);
  options.maxDiffBytes = options.maxDiffBytes || config.maxDiffBytes || DEFAULT_MAX_DIFF_BYTES;
  options.reviewProfile = options.reviewProfile ?? config.reviewProfile ?? "chill";
  options.pathFilters = effectivePathFilters(config);
  const events: AgentEvent[] = [];
  try {
    events.push(statusEvent("Collecting Git diff."));
    if (options.mode !== "agent") tui.start("Collecting Git diff");
    const collected = await collectDiff(options);
    const redactedDiff = redactSecrets(collected.diff);
    const context: ReviewContextEvent = {
      type: "review_context",
      repoDir,
      reviewType: options.type,
      base: options.base,
      baseCommit: options.baseCommit,
      diffBytes: collected.bytes,
      truncated: collected.truncated,
      configFiles: options.configFiles,
      untrackedFiles: collected.untrackedFiles,
      skippedUntrackedFiles: collected.skippedUntrackedFiles,
      excludedFiles: collected.excludedFiles
    };
    events.push(context);
    if (collected.skippedUntrackedFiles.length) {
      events.push(warningEvent("Some untracked files were skipped because they were too large, binary, or unreadable.", collected.skippedUntrackedFiles));
    }
    if (collected.excludedFiles.length) {
      events.push(warningEvent("Some files were excluded by path filters.", collected.excludedFiles));
    }
    const instructionFiles = unique([...options.configFiles, ...(await findAutoInstructionFiles(repoDir, effectiveGuidelineFiles(config)))]);
    context.instructionFiles = instructionFiles;
    const configText = await readInstructionFiles(instructionFiles, repoDir);
    const pathInstructionText = renderPathInstructions(config, filesFromDiff(redactedDiff));
    if (config.localTools?.some((tool) => tool.enabled !== false)) {
      events.push(statusEvent("Running configured local tools."));
      if (options.mode !== "agent") tui.status("Running configured local tools");
    }
    const toolResults = await runLocalTools(config.localTools, repoDir);
    events.push(...toolResults);
    const toolResultText = renderToolResultsForPrompt(toolResults);
    events.push(statusEvent("Running Codex review."));
    if (options.mode !== "agent") tui.status("Running Codex review");
    const prompt = buildReviewPrompt({ options, diff: redactedDiff, truncated: collected.truncated, configText, pathInstructionText, toolResultText, config });
    const codexOutput = await runCodexExec(prompt, config, repoDir);
    const findings = parseCodexFindings(codexOutput);
    events.push(...findings);
    if (options.mode === "interactive") tui.render(findings, context);
    else if (options.mode !== "agent") process.stdout.write(`${formatPlain(findings, context)}\n`);

    let autoFixApplied = false;
    if (findings.length && (options.fix || (options.mode === "interactive" && (await askAutoFix(findings, false))))) {
      events.push(statusEvent("Generating Codex auto-fix patch."));
      if (options.mode !== "agent") tui.status("Generating Codex auto-fix patch");
      const beforeStatus = await worktreeStatus(repoDir);
      events.push(worktreeStatusEvent("before_autofix", beforeStatus));
      const fixPrompt = buildAutoFixPrompt({ findings, diff: redactedDiff, truncated: collected.truncated, config });
      const fixOutput = await runCodexExec(fixPrompt, config, repoDir);
      const patch = extractUnifiedDiff(fixOutput);
      const result = await applyPatch(repoDir, patch);
      autoFixApplied = result.applied;
      const afterStatus = await worktreeStatus(repoDir);
      events.push(worktreeStatusEvent("after_autofix", afterStatus));
      events.push({ type: "autofix", applied: result.applied, summary: result.summary, changedFiles: result.changedFiles ?? [], needsRerun: result.applied, rerunCommand: result.applied ? buildRerunCommand(options) : undefined });
      if (options.mode !== "agent") process.stdout.write(`${renderAutoFixResult(result)}\n`);
    }

    const blockingToolFailures = hasBlockingToolFailures(toolResults);
    const summary = blockingToolFailures ? `${findings.length} finding(s); blocking local tool failure.` : `${findings.length} finding(s).`;
    events.push({ type: "complete", findingsCount: findings.length, summary, autoFixApplied, needsRerun: autoFixApplied, rerunCommand: autoFixApplied ? buildRerunCommand(options) : undefined });
    if (options.mode === "agent") process.stdout.write(formatJsonl(events));
    return autoFixApplied ? 4 : hasBlockingFindings(findings) || blockingToolFailures ? 3 : 0;
  } catch (err) {
    const errorEvent = { type: "error" as const, protocolVersion: AGENT_PROTOCOL_VERSION, schemaVersion: AGENT_SCHEMA_VERSION, message: err instanceof Error ? err.message : String(err) };
    tui.stop();
    if (options.mode === "agent") process.stdout.write(formatJsonl([...events, errorEvent]));
    else console.error(`Review failed: ${errorEvent.message}`);
    return 1;
  }
}

async function summarize(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return 0;
  }
  const file = args[0];
  const input = file && file !== "-" ? await readFile(resolve(file), "utf8") : await readStdin();
  process.stdout.write(summarizeAgentJsonl(input));
  return 0;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function authStatus(): Promise<number> {
  const config = await loadConfig(process.cwd());
  const output = await codexAuthStatus(config);
  console.log(output.trim().toLowerCase().includes("ok") ? "Codex CLI auth appears available." : output.trim());
  return 0;
}

async function configInit(args: string[]): Promise<number> {
  const dir = valueAfter(args, "--dir") || process.cwd();
  const path = await initConfig(dir);
  console.log(`Created ${path}`);
  return 0;
}

function parseReviewArgs(args: string[]): ReviewOptions {
  const options: ReviewOptions = {
    dir: process.cwd(),
    type: "all",
    configFiles: [],
    color: true,
    maxDiffBytes: DEFAULT_MAX_DIFF_BYTES,
    mode: "plain",
    fix: false
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--agent") options.mode = "agent";
    else if (arg === "--plain") options.mode = "plain";
    else if (arg === "--interactive" || arg === "--tui") options.mode = "interactive";
    else if (arg === "--fix") options.fix = true;
    else if (arg === "--no-color") options.color = false;
    else if (arg === "-t" || arg === "--type") options.type = parseType(args[++i]);
    else if (arg === "--base") options.base = required(args[++i], arg);
    else if (arg === "--base-commit") options.baseCommit = required(args[++i], arg);
    else if (arg === "--dir") options.dir = resolve(required(args[++i], arg));
    else if (arg === "--max-diff-bytes") options.maxDiffBytes = Number.parseInt(required(args[++i], arg), 10);
    else if (arg === "--profile") options.reviewProfile = parseProfile(args[++i]);
    else if (arg === "-c" || arg === "--config") {
      while (args[i + 1] && !args[i + 1].startsWith("-")) options.configFiles.push(args[++i]);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isFinite(options.maxDiffBytes) || options.maxDiffBytes < 1000) throw new Error("--max-diff-bytes must be at least 1000.");
  return options;
}

async function readInstructionFiles(files: string[], repoDir: string): Promise<string> {
  const chunks: string[] = [];
  const realRepoDir = await realpath(repoDir);
  for (const file of files) {
    const path = resolve(repoDir, file);
    const lexicalRel = relative(repoDir, path);
    if (lexicalRel.startsWith("..") || lexicalRel === "" || isAbsolute(lexicalRel)) throw new Error(`Config file must be inside repo: ${file}`);

    const linkInfo = await lstat(path);
    if (linkInfo.isSymbolicLink()) throw new Error(`Config file must not be a symlink: ${file}`);

    const realFilePath = await realpath(path);
    const realRel = relative(realRepoDir, realFilePath);
    if (realRel.startsWith("..") || realRel === "" || isAbsolute(realRel)) throw new Error(`Config file must be inside repo: ${file}`);

    const fileInfo = await stat(realFilePath);
    if (!fileInfo.isFile()) throw new Error(`Config path must be a file: ${file}`);
    if (fileInfo.size > 50000) throw new Error(`Config file is too large: ${file}`);

    chunks.push(`# ${file}\n${await readFile(realFilePath, "utf8")}`);
  }
  return chunks.join("\n\n").slice(0, 50000);
}

async function findAutoInstructionFiles(repoDir: string, candidates: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const candidate of candidates) {
    try {
      const path = resolve(repoDir, candidate);
      const info = await lstat(path);
      if (info.isFile() && !info.isSymbolicLink() && info.size <= 50000) found.push(candidate);
    } catch {
      // Missing guideline files are expected.
    }
  }
  return found;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function parseType(value: string | undefined): ReviewType {
  if (value === "all" || value === "committed" || value === "uncommitted") return value;
  throw new Error("--type must be one of all, committed, uncommitted.");
}

function parseProfile(value: string | undefined): ReviewProfile {
  if (value === "chill" || value === "assertive") return value;
  throw new Error("--profile must be one of chill, assertive.");
}

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function statusEvent(message: string): AgentEvent {
  return { type: "status", protocolVersion: AGENT_PROTOCOL_VERSION, schemaVersion: AGENT_SCHEMA_VERSION, message };
}

function warningEvent(message: string, files?: string[]): AgentEvent {
  return { type: "warning", protocolVersion: AGENT_PROTOCOL_VERSION, schemaVersion: AGENT_SCHEMA_VERSION, message, files };
}

function worktreeStatusEvent(phase: "before_autofix" | "after_autofix", entries: string[]): AgentEvent {
  return { type: "worktree_status", protocolVersion: AGENT_PROTOCOL_VERSION, schemaVersion: AGENT_SCHEMA_VERSION, phase, dirty: entries.length > 0, entries };
}

function buildRerunCommand(options: ReviewOptions): string {
  const parts = ["crx", "review", "--agent", "--type", options.type];
  if (options.base) parts.push("--base", options.base);
  if (options.baseCommit) parts.push("--base-commit", options.baseCommit);
  if (options.reviewProfile) parts.push("--profile", options.reviewProfile);
  for (const file of options.configFiles) parts.push("--config", file);
  return parts.join(" ");
}

function hasBlockingFindings(findings: { severity: string }[]): boolean {
  return findings.some((f) => f.severity === "critical" || f.severity === "major");
}

function printHelp(): void {
  console.log(`crx - local CodeRabbit-style review with Codex CLI

Usage:
  crx [review] [--agent] [--interactive|--tui] [--fix] [-t all|committed|uncommitted] [--base branch] [--base-commit sha]
  crx summarize <crx-review.jsonl|->
  crx auth status
  crx config init

Options:
  --dir <path>              Git repository directory
  -c, --config <files...>   Extra instruction files inside the repo
  --max-diff-bytes <n>      Maximum diff bytes sent to Codex
  --profile <mode>          Review noise profile: chill or assertive
  --fix                     Ask Codex to generate and apply a minimal git patch for findings
  --no-color                Disable color output

Summaries:
  crx summarize file.jsonl  Print finding/tool failure counts and blocking details

Exit codes:
  0 no blocking findings; 1 command/review failure; 3 blocking findings; 4 auto-fix applied, rerun required

Config: ${CONFIG_NAME}`);
}

main().then((code) => {
  process.exitCode = code;
});
