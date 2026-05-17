import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { collectDiff } from "../src/git.js";

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test("committed review does not treat shallow non-root HEAD as root commit", async () => {
  const origin = await mkdtemp(join(tmpdir(), "crx-origin-"));
  git(origin, ["init"]);
  git(origin, ["config", "user.email", "test@example.com"]);
  git(origin, ["config", "user.name", "Test User"]);
  await writeFile(join(origin, "hello.txt"), "one\n");
  git(origin, ["add", "hello.txt"]);
  git(origin, ["commit", "-m", "initial"]);
  await writeFile(join(origin, "hello.txt"), "one\ntwo\n");
  git(origin, ["add", "hello.txt"]);
  git(origin, ["commit", "-m", "second"]);

  const shallow = await mkdtemp(join(tmpdir(), "crx-shallow-"));
  git(shallow, ["clone", "--depth", "1", `file://${origin}`, "."]);

  const commitObject = await readFile(join(shallow, ".git", "shallow"), "utf8");
  assert.ok(commitObject.trim().length > 0);

  await assert.rejects(
    collectDiff({
      dir: shallow,
      type: "committed",
      configFiles: [],
      color: false,
      maxDiffBytes: 10000,
      mode: "plain"
    }),
    /ambiguous argument|unknown revision|git diff failed/
  );
});
