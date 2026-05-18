import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { filesFromDiff, fileStatsFromDiff, filterDiffByPath } from "./scope.js";
import type { ChangedFileStat, ReviewOptions, ReviewType } from "./types.js";

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

export async function collectDiff(options: ReviewOptions): Promise<{ diff: string; truncated: boolean; bytes: number; changedFiles: string[]; changedFileStats: ChangedFileStat[]; untrackedFiles: string[]; skippedUntrackedFiles: string[]; excludedFiles: string[] }> {
  const diffResult = await collectDiffText(options);
  const filtered = filterDiffByPath(diffResult.diff, options.pathFilters ?? []);
  const diff = filtered.diff;
  const changedFileStats = fileStatsFromDiff(diff);
  const changedFiles = filesFromDiff(diff);
  const bytes = Buffer.byteLength(diff, "utf8");
  if (bytes <= options.maxDiffBytes) return { diff, truncated: false, bytes, changedFiles, changedFileStats, untrackedFiles: diffResult.untrackedFiles, skippedUntrackedFiles: diffResult.skippedUntrackedFiles, excludedFiles: filtered.excludedFiles };
  const truncated = Buffer.from(diff, "utf8").subarray(0, options.maxDiffBytes).toString("utf8");
  return { diff: `${truncated}\n\n[CRX_DIFF_TRUNCATED at ${options.maxDiffBytes} bytes]\n`, truncated: true, bytes, changedFiles, changedFileStats, untrackedFiles: diffResult.untrackedFiles, skippedUntrackedFiles: diffResult.skippedUntrackedFiles, excludedFiles: filtered.excludedFiles };
}

async function collectDiffText(options: ReviewOptions): Promise<{ diff: string; untrackedFiles: string[]; skippedUntrackedFiles: string[] }> {
  const command = buildDiffCommand(options);
  const result = await runGit(command.args, options.dir);
  if (result.code === 0) return appendUntracked(options, result.stdout);

  if (!options.base && !options.baseCommit && options.type === "committed" && (await isRootCommit(options.dir))) {
    const rootCommit = await runGit(["show", "--format=", "--no-ext-diff", "--no-color", "HEAD"], options.dir);
    if (rootCommit.code === 0) return appendUntracked(options, rootCommit.stdout);
  }

  if (!options.base && !options.baseCommit && (options.type === "all" || options.type === "uncommitted")) {
    const staged = await runGit(["diff", "--cached", "--no-ext-diff", "--no-color"], options.dir);
    const unstaged = await runGit(["diff", "--no-ext-diff", "--no-color"], options.dir);
    if (staged.code === 0 && unstaged.code === 0) return appendUntracked(options, [staged.stdout, unstaged.stdout].filter(Boolean).join("\n"));
  }

  if (options.base || options.baseCommit) {
    throw new Error(await baseDiffError(options, result.stderr || result.stdout));
  }

  throw new Error(result.stderr || "git diff failed");
}

async function baseDiffError(options: ReviewOptions, raw: string): Promise<string> {
  const target = options.baseCommit || options.base || "base";
  const kind = options.baseCommit ? "base commit" : "base branch";
  const mergeBase = await runGit(["merge-base", target, "HEAD"], options.dir);
  const missingMergeBase = mergeBase.code !== 0;
  const lines = [
    `Unable to diff against ${kind} ${JSON.stringify(target)} with ${target}...HEAD.`,
    raw.trim() ? `Git said: ${raw.trim()}` : undefined,
    missingMergeBase ? "No merge base was found. This commonly happens in shallow clones, fresh CI checkouts, or when the base ref has not been fetched." : undefined,
    options.base
      ? `Try: git fetch origin ${target} --depth=50, then rerun crx review --base ${target}. In GitHub Actions, use actions/checkout with fetch-depth: 0 for reliable base reviews.`
      : `Try fetching the missing commit history or use --base with a fetched branch name. In GitHub Actions, use actions/checkout with fetch-depth: 0.`
  ].filter(Boolean);
  return lines.join("\n");
}

async function appendUntracked(options: ReviewOptions, diff: string): Promise<{ diff: string; untrackedFiles: string[]; skippedUntrackedFiles: string[] }> {
  if (options.type === "committed" || options.base || options.baseCommit) return { diff, untrackedFiles: [], skippedUntrackedFiles: [] };
  const result = await runGit(["ls-files", "--others", "--exclude-standard", "-z"], options.dir);
  if (result.code !== 0 || !result.stdout) return { diff, untrackedFiles: [], skippedUntrackedFiles: [] };

  const included: string[] = [];
  const skipped: string[] = [];
  const chunks: string[] = [];
  for (const file of result.stdout.split("\0").filter(Boolean)) {
    const path = resolve(options.dir, file);
    const rel = relative(options.dir, path);
    if (rel.startsWith("..")) {
      skipped.push(file);
      continue;
    }
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size > 50000) {
        skipped.push(file);
        continue;
      }
      const content = await readFile(path);
      if (content.includes(0)) {
        skipped.push(file);
        continue;
      }
      const text = content.toString("utf8");
      if (text.includes("�")) {
        skipped.push(file);
        continue;
      }
      included.push(file);
      chunks.push(renderUntrackedFile(file, text));
    } catch {
      skipped.push(file);
    }
  }
  const untrackedDiff = chunks.join("\n");
  return { diff: [diff, untrackedDiff].filter(Boolean).join("\n"), untrackedFiles: included, skippedUntrackedFiles: skipped };
}

function renderUntrackedFile(file: string, content: string): string {
  const lines = contentLines(content);
  const body = lines.map((line) => `+${line}`).join("\n");
  return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${body}\n`;
}

function contentLines(content: string): string[] {
  if (content === "") return [];
  const lines = content.split(/\r?\n/);
  if (content.endsWith("\n") || content.endsWith("\r\n")) lines.pop();
  return lines;
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


export async function worktreeStatus(cwd: string): Promise<string[]> {
  const result = await runGit(["status", "--porcelain=v1"], cwd);
  if (result.code !== 0) throw new Error(result.stderr || "git status failed");
  return result.stdout.split(/\r?\n/).filter(Boolean);
}
