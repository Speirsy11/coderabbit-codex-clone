import test from "node:test";
import assert from "node:assert/strict";
import { resolveCodexCommand, splitCommand } from "../src/command.js";

test("splits quoted command", () => {
  assert.deepEqual(splitCommand('node "my cli.js" --flag'), ["node", "my cli.js", "--flag"]);
});

test("env command wins over config", () => {
  assert.deepEqual(resolveCodexCommand("codex-local --x", "other"), ["codex-local", "--x"]);
});

test("default codex command uses npx package", () => {
  assert.deepEqual(resolveCodexCommand(undefined, undefined), ["npx", "-y", "@openai/codex"]);
});
