import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLocalTools, renderToolResultsForPrompt, hasBlockingToolFailures } from "../src/tools.js";

test("runs configured local tools without shell interpolation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-tools-"));
  const script = join(dir, "tool.mjs");
  await writeFile(script, "process.stdout.write('ok:' + process.argv[2]);\n");
  const results = await runLocalTools([{ name: "unit", command: [process.execPath, script, "hello;not-shell"] }], dir);
  assert.equal(results.length, 1);
  assert.equal(results[0].passed, true);
  assert.equal(results[0].stdout, "ok:hello;not-shell");
  assert.deepEqual(results[0].command, [process.execPath, script, "hello;not-shell"]);
});

test("reports blocking failures and renders prompt context", async () => {
  const results = await runLocalTools([{ name: "lint", command: [process.execPath, "-e", "console.error('lint failed'); process.exit(2)"] }], process.cwd());
  assert.equal(results[0].exitCode, 2);
  assert.equal(results[0].passed, false);
  assert.equal(hasBlockingToolFailures(results), true);
  const prompt = renderToolResultsForPrompt(results);
  assert.match(prompt, /## lint/);
  assert.match(prompt, /failed with exit 2/);
  assert.match(prompt, /lint failed/);
});

test("non-blocking tool failures do not fail the gate", async () => {
  const results = await runLocalTools([{ name: "advisory", command: [process.execPath, "-e", "process.exit(9)"], blocking: false }], process.cwd());
  assert.equal(results[0].passed, false);
  assert.equal(results[0].blocking, false);
  assert.equal(hasBlockingToolFailures(results), false);
});
