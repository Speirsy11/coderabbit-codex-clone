import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateAgentEvent } from "../src/agent-events.js";
import type { AgentEvent } from "../src/types.js";

const projectRoot = resolve(import.meta.dirname, "..");
const expectedEvents = ["status", "review_context", "warning", "tool_result", "finding", "worktree_status", "autofix", "complete", "error"];

test("agent contract examples stay valid against runtime validator", async () => {
  const docs = await readFile(resolve(projectRoot, "docs/agent-contract.md"), "utf8");
  const examples = [...docs.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]) as AgentEvent);
  assert.equal(examples.length, expectedEvents.length);
  assert.deepEqual(examples.map((event) => event.type), expectedEvents);
  for (const event of examples) assert.deepEqual(validateAgentEvent(event), []);
});

test("agent event schema enum stays aligned with documented event order", async () => {
  const schema = JSON.parse(await readFile(resolve(projectRoot, "docs/schema/agent-event.schema.json"), "utf8"));
  assert.deepEqual(schema.properties.type.enum, expectedEvents);
});
