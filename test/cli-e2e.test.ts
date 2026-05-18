import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

test("invalid review option exits with controlled error and no stack trace", () => {
  const result = runCli(["review", "--bad-option"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /crx: Unknown option: --bad-option/);
  assert.doesNotMatch(result.stderr, /at .*src\/cli|Error:/);
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
  assert.equal(await readFile(join(dir, "app.ts"), "utf8"), "export const value = 3;\n");
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
});


test("path filters, path instructions, and auto guidelines shape the review prompt", async () => {
  const dir = await createRepo();
  await mkdir(join(dir, "dist"));
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "AGENTS.md"), "Project rule: prefer safe CLI exits.\n");
  await writeFile(join(dir, "crx.config.json"), JSON.stringify({
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
  assert.ok(context.instructionFiles.includes("AGENTS.md"));
  assert.equal(events.some((e) => e.type === "warning" && e.files?.includes("dist/bundle.js")), true);

  const prompt = await readFile(capture, "utf8");
  assert.match(prompt, /Project rule: prefer safe CLI exits/);
  assert.match(prompt, /Check TypeScript runtime behavior/);
  assert.match(prompt, /src\/feature\.ts/);
  assert.doesNotMatch(prompt, /dist\/bundle\.js/);
});
