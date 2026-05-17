import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initConfig, loadConfig } from "../src/config.js";

test("config init creates readable config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crx-"));
  const path = await initConfig(dir);
  const raw = await readFile(path, "utf8");
  assert.match(raw, /codexCommand/);
  const loaded = await loadConfig(dir);
  assert.equal(loaded.codexCommand, "npx -y @openai/codex");
});
