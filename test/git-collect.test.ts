import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { collectDiff } from "../src/git.js";

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("collects root commit diff for committed review", async () => {
  const dir = await createRootCommit("initial");

  const result = await collectDiff({
    dir,
    type: "committed",
    configFiles: [],
    color: false,
    maxDiffBytes: 10000,
    mode: "plain"
  });

  assert.match(result.diff, /hello\.txt/);
  assert.match(result.diff, /\+hello/);
});

test("root commit detection ignores commit message parent-looking lines", async () => {
  const dir = await createRootCommit("initial\n\nparent not-a-real-header");

  const result = await collectDiff({
    dir,
    type: "committed",
    configFiles: [],
    color: false,
    maxDiffBytes: 10000,
    mode: "plain"
  });

  assert.match(result.diff, /hello\.txt/);
  assert.match(result.diff, /\+hello/);
});


test("base diff errors explain shallow or unfetched base remediation", async () => {
  const dir = await createRootCommit("initial");

  await assert.rejects(
    collectDiff({
      dir,
      type: "all",
      base: "missing-main",
      configFiles: [],
      color: false,
      maxDiffBytes: 10000,
      mode: "plain",
      fix: false
    }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Unable to diff against base branch/);
      assert.match(err.message, /No merge base was found|unknown revision|ambiguous argument/);
      assert.match(err.message, /git fetch origin missing-main --depth=50/);
      assert.match(err.message, /fetch-depth: 0/);
      return true;
    }
  );
});

async function createRootCommit(message: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "crx-root-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test User"]);
  await writeFile(join(dir, "hello.txt"), "hello\n");
  git(dir, ["add", "hello.txt"]);
  git(dir, ["commit", "-m", message]);
  return dir;
}
