import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

test("agent event schema is valid JSON and tracks protocol version", async () => {
  const raw = await readFile(resolve(projectRoot, "docs/schema/agent-event.schema.json"), "utf8");
  const schema = JSON.parse(raw);
  assert.equal(schema.properties.protocolVersion.const, "0.2");
  assert.equal(schema.properties.schemaVersion.const, "crx.agent.v0.2");
  assert.ok(schema.properties.type.enum.includes("finding"));
  assert.ok(schema.properties.type.enum.includes("tool_result"));
  assert.ok(schema.properties.type.enum.includes("worktree_status"));
});

test("quality gate shell wrapper parses", () => {
  const result = spawnSync("bash", ["-n", "scripts/crx-quality-gate.sh"], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
