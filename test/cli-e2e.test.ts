import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const cliArgs = ["--import", "tsx", "src/cli.ts"];

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function createRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "crx-cli-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test User"]);
  await writeFile(join(dir, "app.ts"), "export const value = 1;\n");
  git(dir, ["add", "app.ts"]);
  git(dir, ["commit", "-m", "initial"]);
  return dir;
}

async function writeMockCodex(mode: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "crx-mock-")), "mock-codex.mjs");
  const source = `
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const mode = ${JSON.stringify(mode)};
  if (mode === "invalid") {
    process.stdout.write("not json");
    return;
  }
  if (mode === "fix" && input.includes("Return ONLY a unified diff patch")) {
    process.stdout.write("diff --git a/app.ts b/app.ts\\n--- a/app.ts\\n+++ b/app.ts\\n@@ -1 +1 @@\\n-export const value = 2;\\n+export const value = 3;\\n");
    return;
  }
  if (mode === "major" || mode === "fix") {
    process.stdout.write(JSON.stringify({ findings: [{ type: "finding", severity: "major", fileName: "app.ts", lineStart: 1, title: "Bad value", message: "Value is unsafe.", impact: "Breaks callers.", codegenInstructions: "Use a safer value.", suggestions: ["Change the value"] }] }));
    return;
  }
  process.stdout.write(JSON.stringify({ findings: [] }));
});
`;
  await writeFile(path, source);
  return path;
}

async function writeCapturingCodex(capturePath: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "crx-mock-")), "capture-codex.mjs");
  const source = `
import { writeFileSync } from "node:fs";
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  writeFileSync(${JSON.stringify(capturePath)}, input);
  process.stdout.write(JSON.stringify({ findings: [] }));
});
`;
  await writeFile(path, source);
  return path;
}

function runCli(args: string[], mockPath?: string) {
  return spawnSync(process.execPath, [...cliArgs, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CRX_CODEX_COMMAND: mockPath ? `${process.execPath} ${mockPath}` : process.env.CRX_CODEX_COMMAND,
      NO_COLOR: "1"
    }
  });
}

function parseJsonl(stdout: string): any[] {
  return stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("crx --help and review --help exit cleanly", () => {
  for (const args of [["--help"], ["review", "--help"]]) {
    const result = runCli(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:/);
    assert.doesNotMatch(result.stderr, /Error:|at /);
  }
});

test("summarize prints JSONL artifact overview", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-summary-"));
  const file = join(dir, "review.jsonl");
  await writeFile(file, `${JSON.stringify({ type: "complete", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", findingsCount: 0, summary: "0 finding(s)." })}\n`);
  const result = runCli(["summarize", file]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CRX JSONL summary/);
  assert.match(result.stdout, /Findings: 0/);
});

test("summarize artifact formats preserve blocking exit codes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-summary-"));
  const file = join(dir, "review.jsonl");
  await writeFile(file, `${JSON.stringify({ type: "finding", protocolVersion: "0.2", schemaVersion: "crx.agent.v0.2", severity: "major", category: "potential_issue", fileName: "src/app.ts", lineStart: 4, title: "Crash", message: "bad", impact: "boom", codegenInstructions: "fix", suggestions: [] })}\n`);

  const sarif = runCli(["summarize", "--format", "sarif", file]);
  assert.equal(sarif.status, 3, sarif.stderr);
  assert.equal(JSON.parse(sarif.stdout).runs[0].results[0].level, "error");

  const junit = runCli(["summarize", "--format", "junit", file]);
  assert.equal(junit.status, 3, junit.stderr);
  assert.match(junit.stdout, /<testsuite name="crx"/);

  const json = runCli(["summarize", "--format", "json", file]);
  assert.equal(json.status, 3, json.stderr);
  assert.equal(JSON.parse(json.stdout).findings.bySeverity.major, 1);
});

test("config validate prints sanitized config JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-config-"));
  await writeFile(join(dir, ".coderabbit.yaml"), "reviews:\n  profile: assertive\n");
  const result = runCli(["config", "validate", "--json", "--dir", dir]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.source, ".coderabbit.yaml");
  assert.equal(parsed.config.reviewProfile, "assertive");
});

test("config validate reports invalid config cleanly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-config-"));
  await writeFile(join(dir, "crx.config.json"), "{not-json");
  const result = runCli(["config", "validate", "--dir", dir]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid crx\.config\.json/);
  assert.doesNotMatch(result.stderr, /at .*src\/cli|Error:/);
});

test("invalid review option exits with controlled error and no stack trace", () => {
  const result = runCli(["review", "--bad-option"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /crx: Unknown option: --bad-option/);
  assert.doesNotMatch(result.stderr, /at .*src\/cli|Error:/);
});

test("invalid profile exits with controlled error", () => {
  const result = runCli(["review", "--profile", "noisy"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--profile must be one of chill, assertive/);
});

test("agent mode emits JSONL-only stdout and exits 0 for zero findings", async () => {
  const dir = await createRepo();
  await writeFile(join(dir, "app.ts"), "export const value = 2;\n");
  const mock = await writeMockCodex("zero");
  const result = runCli(["review", "--agent", "--dir", dir, "--type", "uncommitted"], mock);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const events = parseJsonl(result.stdout);
  assert.deepEqual(events.map((e) => e.type), ["status", "review_context", "status", "complete"]);
  assert.equal(events[0].protocolVersion, "0.2");
});

test("agent mode exits 3 and emits finding for blocking findings", async () => {
  const dir = await createRepo();
  await writeFile(join(dir, "app.ts"), "export const value = 2;\n");
  const mock = await writeMockCodex("major");
  const result = runCli(["review", "--agent", "--dir", dir, "--type", "uncommitted"], mock);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  const events = parseJsonl(result.stdout);
  assert.equal(events.find((e) => e.type === "finding")?.severity, "major");
  assert.equal(events.at(-1).type, "complete");
  assert.equal(events.at(-1).blockingFindingsCount, 1);
  assert.equal(events.at(-1).blockingToolsCount, 0);
  assert.equal(events.at(-1).exitCode, 3);
});

test("agent mode emits error event for invalid Codex output", async () => {
  const dir = await createRepo();
  await writeFile(join(dir, "app.ts"), "export const value = 2;\n");
  const mock = await writeMockCodex("invalid");
  const result = runCli(["review", "--agent", "--dir", dir, "--type", "uncommitted"], mock);
  assert.equal(result.status, 1);
  const events = parseJsonl(result.stdout);
  assert.equal(events.at(-1).type, "error");
  assert.match(events.at(-1).message, /no valid JSON findings array|Could not parse Codex JSON output/);
});

test("agent auto-fix exits 4 and marks rerun required after applying a patch", async () => {
  const dir = await createRepo();
  await writeFile(join(dir, "app.ts"), "export const value = 2;\n");
  const mock = await writeMockCodex("fix");
  const result = runCli(["review", "--agent", "--fix", "--dir", dir, "--type", "uncommitted"], mock);
  assert.equal(result.status, 4, result.stdout + result.stderr);
  const events = parseJsonl(result.stdout);
  const statuses = events.filter((e) => e.type === "worktree_status");
  assert.deepEqual(statuses.map((s) => s.phase), ["before_autofix", "after_autofix"]);
  assert.equal(statuses[0].dirty, true);
  assert.equal(statuses[1].entries.some((entry) => entry.includes("app.ts")), true);
  const autofix = events.find((e) => e.type === "autofix");
  assert.equal(autofix.applied, true);
  assert.deepEqual(autofix.changedFiles, ["app.ts"]);
  assert.equal(autofix.needsRerun, true);
  assert.equal(events.at(-1).needsRerun, true);
  assert.equal(events.at(-1).exitCode, 4);
  assert.equal(await readFile(join(dir, "app.ts"), "utf8"), "export const value = 3;\n");
});

test("agent auto-fix can verify with post-fix local tools", async () => {
  const dir = await createRepo();
  await writeFile(join(dir, "app.ts"), "export const value = 2;\n");
  await writeFile(join(dir, "crx.config.json"), JSON.stringify({
    localTools: [{ name: "verify", command: [process.execPath, "-e", "process.stdout.write('verified')"] }]
  }));
  const mock = await writeMockCodex("fix");
  const result = runCli(["review", "--agent", "--fix", "--verify-fix", "--dir", dir, "--type", "uncommitted"], mock);
  assert.equal(result.status, 4, result.stdout + result.stderr);
  const events = parseJsonl(result.stdout);
  const toolPhases = events.filter((e) => e.type === "tool_result").map((e) => e.phase);
  assert.deepEqual(toolPhases, ["pre_review", "post_autofix"]);
  assert.equal(events.some((e) => e.type === "status" && e.message === "Running post-fix local tools."), true);
  assert.equal(events.at(-1).exitCode, 4);
});


test("untracked text files are included in uncommitted review context", async () => {
  const dir = await createRepo();
  await writeFile(join(dir, "new-file.ts"), "export const created = true;\n");
  const mock = await writeMockCodex("zero");
  const result = runCli(["review", "--agent", "--dir", dir, "--type", "uncommitted"], mock);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const events = parseJsonl(result.stdout);
  const context = events.find((e) => e.type === "review_context");
  assert.deepEqual(context.untrackedFiles, ["new-file.ts"]);
  assert.deepEqual(context.changedFiles, ["new-file.ts"]);
  assert.deepEqual(context.changedFileStats, [{ fileName: "new-file.ts", status: "added", additions: 1, deletions: 0 }]);
  assert.equal(context.changedFilesCount, 1);
  assert.equal(context.reviewedFilesCount, 1);
  assert.equal(context.excludedFilesCount, 0);
});


test("path filters, path instructions, and auto guidelines shape the review prompt", async () => {
  const dir = await createRepo();
  await mkdir(join(dir, "dist"));
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "AGENTS.md"), "Project rule: prefer safe CLI exits.\n");
  await writeFile(join(dir, "src", "AGENTS.md"), "Source rule: check runtime boundaries.\n");
  git(dir, ["add", "AGENTS.md", "src/AGENTS.md"]);
  git(dir, ["commit", "-m", "add guideline files"]);
  await writeFile(join(dir, "crx.config.json"), JSON.stringify({
    reviewProfile: "assertive",
    pathFilters: ["dist/**"],
    pathInstructions: [{ pattern: "src/**/*.ts", instructions: ["Check TypeScript runtime behavior."] }]
  }));
  await writeFile(join(dir, "src", "feature.ts"), "export const feature = true;\n");
  await writeFile(join(dir, "dist", "bundle.js"), "generated();\n");
  const capture = join(dir, "prompt.txt");
  const mock = await writeCapturingCodex(capture);

  const result = runCli(["review", "--agent", "--dir", dir, "--type", "uncommitted"], mock);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const events = parseJsonl(result.stdout);
  const context = events.find((e) => e.type === "review_context");
  assert.deepEqual(context.excludedFiles, ["dist/bundle.js"]);
  assert.deepEqual(context.excludedFileStats, [{ fileName: "dist/bundle.js", status: "added", additions: 1, deletions: 0 }]);
  assert.deepEqual(context.changedFiles, ["crx.config.json", "src/feature.ts"]);
  assert.deepEqual(context.changedFileStats.map((item) => item.fileName), ["crx.config.json", "src/feature.ts"]);
  assert.equal(context.changedFileStats.every((item) => item.status === "added"), true);
  assert.equal(context.changedFilesCount, 3);
  assert.equal(context.reviewedFilesCount, 2);
  assert.equal(context.excludedFilesCount, 1);
  assert.equal(context.configSource, "crx.config.json");
  assert.ok(context.instructionFiles.includes("AGENTS.md"));
  assert.ok(context.instructionFiles.includes("src/AGENTS.md"));
  assert.equal(events.some((e) => e.type === "warning" && e.files?.includes("dist/bundle.js")), true);

  const prompt = await readFile(capture, "utf8");
  assert.match(prompt, /Review profile: assertive/);
  assert.match(prompt, /Project rule: prefer safe CLI exits/);
  assert.match(prompt, /Source rule: check runtime boundaries/);
  assert.match(prompt, /Check TypeScript runtime behavior/);
  assert.match(prompt, /src\/feature\.ts/);
  assert.doesNotMatch(prompt, /dist\/bundle\.js/);
});


test("CI artifact smoke combines config validate, review JSONL, and summaries", async () => {
  const dir = await createRepo();
  await writeFile(join(dir, "app.ts"), "export const value = 2;\n");
  const tool = join(dir, "failing-tool.mjs");
  await writeFile(tool, "process.stderr.write('fixture failure'); process.exit(6);\n");
  await writeFile(join(dir, "crx.config.json"), JSON.stringify({
    localTools: [{ name: "fixture-check", command: [process.execPath, tool], failureSeverity: "critical" }]
  }));
  const config = runCli(["config", "validate", "--json", "--dir", dir]);
  assert.equal(config.status, 0, config.stderr);
  const effective = JSON.parse(config.stdout);
  assert.equal(effective.source, "crx.config.json");
  assert.equal(effective.config.localTools[0].failureSeverity, "critical");

  const mock = await writeMockCodex("zero");
  const review = runCli(["review", "--agent", "--dir", dir, "--type", "uncommitted"], mock);
  assert.equal(review.status, 3, review.stdout + review.stderr);
  const events = parseJsonl(review.stdout);
  assert.equal(events.find((e) => e.type === "review_context")?.configSource, "crx.config.json");
  assert.equal(events.find((e) => e.type === "tool_result")?.severity, "critical");

  const artifact = join(dir, "crx-review.jsonl");
  await writeFile(artifact, review.stdout);
  const summary = runCli(["summarize", artifact]);
  assert.equal(summary.status, 3, summary.stderr);
  assert.match(summary.stdout, /CRITICAL fixture-check: exit 6/);
});


test("local tool failures emit JSONL tool_result and fail the gate", async () => {
  const dir = await createRepo();
  await writeFile(join(dir, "app.ts"), "export const value = 2;\n");
  const tool = join(dir, "failing-tool.mjs");
  await writeFile(tool, "process.stdout.write('checked app'); process.stderr.write('tool says no'); process.exit(5);\n");
  await writeFile(join(dir, "crx.config.json"), JSON.stringify({
    localTools: [{ name: "project-check", command: [process.execPath, tool] }]
  }));
  const capture = join(dir, "prompt.txt");
  const mock = await writeCapturingCodex(capture);

  const result = runCli(["review", "--agent", "--dir", dir, "--type", "uncommitted"], mock);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  const events = parseJsonl(result.stdout);
  const toolResult = events.find((e) => e.type === "tool_result");
  assert.equal(toolResult.name, "project-check");
  assert.equal(toolResult.exitCode, 5);
  assert.equal(toolResult.passed, false);
  assert.equal(toolResult.blocking, true);
  assert.equal(events.at(-1).type, "complete");
  assert.equal(events.at(-1).blockingToolsCount, 1);
  assert.equal(events.at(-1).exitCode, 3);

  const prompt = await readFile(capture, "utf8");
  assert.match(prompt, /Local tool results:/);
  assert.match(prompt, /project-check/);
  assert.match(prompt, /tool says no/);
});


test("quality gate wrapper validates config, review JSONL, and summary artifacts", async () => {
  const dir = await createRepo();
  await writeFile(join(dir, "app.ts"), "export const value = 2;\n");
  const tool = join(dir, "failing-tool.mjs");
  await writeFile(tool, "process.stdout.write('tool checked app'); process.stderr.write('tool failed intentionally'); process.exit(5);\n");
  await writeFile(join(dir, "crx.config.json"), JSON.stringify({
    reviewProfile: "chill",
    localTools: [{ name: "project-check", command: [process.execPath, tool] }]
  }));

  const mock = await writeMockCodex("zero");
  const binDir = await mkdtemp(join(tmpdir(), "crx-bin-"));
  const wrapper = join(binDir, "crx");
  await writeFile(wrapper, `#!/usr/bin/env bash\nexec ${JSON.stringify(join(projectRoot, "node_modules", ".bin", "tsx"))} ${JSON.stringify(join(projectRoot, "src", "cli.ts"))} "$@"\n`);
  await chmod(wrapper, 0o755);

  const result = spawnSync("bash", [join(projectRoot, "scripts", "crx-quality-gate.sh")], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      CRX_CODEX_COMMAND: `${process.execPath} ${mock}`,
      CRX_REVIEW_TYPE: "uncommitted",
      NO_COLOR: "1"
    }
  });

  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stderr, /blocking findings remain|See crx-review\.jsonl/);

  const config = JSON.parse(await readFile(join(dir, "crx-config.json"), "utf8"));
  assert.equal(config.ok, true);
  assert.equal(config.source, "crx.config.json");

  const events = parseJsonl(await readFile(join(dir, "crx-review.jsonl"), "utf8"));
  const toolResult = events.find((event) => event.type === "tool_result");
  assert.equal(toolResult.name, "project-check");
  assert.equal(toolResult.passed, false);
  assert.equal(events.at(-1).summary, "0 finding(s); blocking local tool failure.");

  assert.match(await readFile(join(dir, "crx-review.txt"), "utf8"), /Blocking tool failures:/);
  assert.equal(JSON.parse(await readFile(join(dir, "crx-review.sarif"), "utf8")).runs[0].tool.driver.name, "crx");
  assert.match(await readFile(join(dir, "crx-review.junit.xml"), "utf8"), /tool:project-check/);
  const metrics = JSON.parse(await readFile(join(dir, "crx-review.metrics.json"), "utf8"));
  assert.equal(metrics.localTools.blockingFailures, 1);
});
