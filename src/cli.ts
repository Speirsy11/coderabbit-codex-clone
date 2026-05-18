#!/usr/bin/env node
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { applyPatch, buildAutoFixPrompt, extractUnifiedDiff } from "./autofix.js";
import { codexAuthStatus, runCodexExec } from "./codex.js";
import { CONFIG_NAME, initConfig, loadConfig } from "./config.js";
import { formatJsonl, formatPlain } from "./format.js";
import { assertGitRepo, collectDiff } from "./git.js";
import { parseCodexFindings } from "./parser.js";
import { AGENT_PROTOCOL_VERSION, AGENT_SCHEMA_VERSION } from "./protocol.js";
import { buildReviewPrompt } from "./prompt.js";
import { redactSecrets } from "./redact.js";
import { askAutoFix, renderAutoFixResult, ReviewTui } from "./tui.js";
import type { AgentEvent, ReviewOptions, ReviewType } from "./types.js";

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
  const events: AgentEvent[] = [];
  try {
    events.push(statusEvent("Collecting Git diff."));
    if (options.mode !== "agent") tui.start("Collecting Git diff");
    const collected = await collectDiff(options);
    const redactedDiff = redactSecrets(collected.diff);
    const context = {
      type: "review_context" as const,
      repoDir,
      reviewType: options.type,
      base: options.base,
      baseCommit: options.baseCommit,
      diffBytes: collected.bytes,
      truncated: collected.truncated,
      configFiles: options.configFiles,
      untrackedFiles: collected.untrackedFiles,
      skippedUntrackedFiles: collected.skippedUntrackedFiles
    };
    events.push(context);
    if (collected.skippedUntrackedFiles.length) {
      events.push(warningEvent("Some untracked files were skipped because they were too large, binary, or unreadable.", collected.skippedUntrackedFiles));
    }
    events.push(statusEvent("Running Codex review."));
    if (options.mode !== "agent") tui.status("Running Codex review");
    const configText = await readInstructionFiles(options.configFiles, repoDir);
    const prompt = buildReviewPrompt({ options, diff: redactedDiff, truncated: collected.truncated, configText, config });
    const codexOutput = await runCodexExec(prompt, config, repoDir);
    const findings = parseCodexFindings(codexOutput);
    events.push(...findings);
    if (options.mode === "interactive") tui.render(findings, context);
    else if (options.mode !== "agent") process.stdout.write(`${formatPlain(findings, context)}\n`);

    let autoFixApplied = false;
    if (findings.length && (options.fix || (options.mode === "interactive" && (await askAutoFix(findings, false))))) {
      events.push(statusEvent("Generating Codex auto-fix patch."));
      if (options.mode !== "agent") tui.status("Generating Codex auto-fix patch");
      const fixPrompt = buildAutoFixPrompt({ findings, diff: redactedDiff, truncated: collected.truncated, config });
      const fixOutput = await runCodexExec(fixPrompt, config, repoDir);
      const patch = extractUnifiedDiff(fixOutput);
      const result = await applyPatch(repoDir, patch);
      autoFixApplied = result.applied;
      events.push({ type: "autofix", applied: result.applied, summary: result.summary, needsRerun: result.applied, rerunCommand: result.applied ? buildRerunCommand(options) : undefined });
      if (options.mode !== "agent") process.stdout.write(`${renderAutoFixResult(result)}\n`);
    }

    events.push({ type: "complete", findingsCount: findings.length, summary: `${findings.length} finding(s).`, autoFixApplied, needsRerun: autoFixApplied, rerunCommand: autoFixApplied ? buildRerunCommand(options) : undefined });
    if (options.mode === "agent") process.stdout.write(formatJsonl(events));
    return autoFixApplied ? 4 : hasBlockingFindings(findings) ? 3 : 0;
  } catch (err) {
    const errorEvent = { type: "error" as const, protocolVersion: AGENT_PROTOCOL_VERSION, schemaVersion: AGENT_SCHEMA_VERSION, message: err instanceof Error ? err.message : String(err) };
    tui.stop();
    if (options.mode === "agent") process.stdout.write(formatJsonl([...events, errorEvent]));
    else console.error(`Review failed: ${errorEvent.message}`);
    return 1;
  }
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

function parseType(value: string | undefined): ReviewType {
  if (value === "all" || value === "committed" || value === "uncommitted") return value;
  throw new Error("--type must be one of all, committed, uncommitted.");
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

function buildRerunCommand(options: ReviewOptions): string {
  const parts = ["crx", "review", "--agent", "--type", options.type];
  if (options.base) parts.push("--base", options.base);
  if (options.baseCommit) parts.push("--base-commit", options.baseCommit);
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
  crx auth status
  crx config init

Options:
  --dir <path>              Git repository directory
  -c, --config <files...>   Extra instruction files inside the repo
  --max-diff-bytes <n>      Maximum diff bytes sent to Codex
  --fix                     Ask Codex to generate and apply a minimal git patch for findings
  --no-color                Disable color output

Exit codes:
  0 no blocking findings; 1 command/review failure; 3 blocking findings; 4 auto-fix applied, rerun required

Config: ${CONFIG_NAME}`);
}

main().then((code) => {
  process.exitCode = code;
});
