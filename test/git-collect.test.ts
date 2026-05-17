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
  const dir = await mkdtemp(join(tmpdir(), "crx-root-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test User"]);
  await writeFile(join(dir, "hello.txt"), "hello\n");
  git(dir, ["add", "hello.txt"]);
  git(dir, ["commit", "-m", "initial"]);

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
