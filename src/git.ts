import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { ReviewOptions, ReviewType } from "./types.js";

export interface GitCommand {
  cmd: "git";
  args: string[];
}

export function buildDiffArgs(type: ReviewType, base?: string, baseCommit?: string): string[] {
  if (baseCommit) return ["diff", "--no-ext-diff", "--no-color", `${baseCommit}...HEAD`];
  if (base) return ["diff", "--no-ext-diff", "--no-color", `${base}...HEAD`];
  if (type === "committed") return ["diff", "--no-ext-diff", "--no-color", "HEAD~1...HEAD"];
  if (type === "uncommitted") return ["diff", "--no-ext-diff", "--no-color", "HEAD"];
  return ["diff", "--no-ext-diff", "--no-color", "HEAD"];
}

export function buildDiffCommand(options: Pick<ReviewOptions, "type" | "base" | "baseCommit">): GitCommand {
  return { cmd: "git", args: buildDiffArgs(options.type, options.base, options.baseCommit) };
}

export async function assertGitRepo(dir: string): Promise<string> {
  const repoDir = resolve(dir);
  const result = await runGit(["rev-parse", "--show-toplevel"], repoDir);
  if (result.code !== 0) throw new Error(`Not a Git repository: ${repoDir}`);
  return result.stdout.trim();
}

export async function collectDiff(options: ReviewOptions): Promise<{ diff: string; truncated: boolean; bytes: number }> {
  const diff = await collectDiffText(options);
  const bytes = Buffer.byteLength(diff, "utf8");
  if (bytes <= options.maxDiffBytes) return { diff, truncated: false, bytes };
  const truncated = Buffer.from(diff, "utf8").subarray(0, options.maxDiffBytes).toString("utf8");
  return { diff: `${truncated}\n\n[CRX_DIFF_TRUNCATED at ${options.maxDiffBytes} bytes]\n`, truncated: true, bytes };
}

async function collectDiffText(options: ReviewOptions): Promise<string> {
  const command = buildDiffCommand(options);
  const result = await runGit(command.args, options.dir);
  if (result.code === 0) return result.stdout;

  if (!options.base && !options.baseCommit && options.type === "committed" && (await isRootCommit(options.dir))) {
    const rootCommit = await runGit(["show", "--format=", "--no-ext-diff", "--no-color", "HEAD"], options.dir);
    if (rootCommit.code === 0) return rootCommit.stdout;
  }

  if (!options.base && !options.baseCommit && (options.type === "all" || options.type === "uncommitted")) {
    const staged = await runGit(["diff", "--cached", "--no-ext-diff", "--no-color"], options.dir);
    const unstaged = await runGit(["diff", "--no-ext-diff", "--no-color"], options.dir);
    if (staged.code === 0 && unstaged.code === 0) return [staged.stdout, unstaged.stdout].filter(Boolean).join("\n");
  }

  throw new Error(result.stderr || "git diff failed");
}

async function isRootCommit(cwd: string): Promise<boolean> {
  const commit = await runGit(["cat-file", "-p", "HEAD"], cwd);
  if (commit.code !== 0) return false;
  const header = commit.stdout.split(/\r?\n\r?\n/, 1)[0] ?? "";
  return !header.split(/\r?\n/).some((line) => line.startsWith("parent "));
}

async function runGit(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn("git", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolvePromise({ code: 1, stdout, stderr: err.message }));
  });
}
