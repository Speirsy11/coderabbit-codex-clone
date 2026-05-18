import test from "node:test";
import assert from "node:assert/strict";
import { validateAgentEvent } from "../src/agent-events.js";
import { formatJsonl } from "../src/format.js";

test("formatJsonl validates required event fields at runtime", () => {
  assert.throws(
    () => formatJsonl([{ type: "tool_result", name: "lint", command: [], exitCode: 0, durationMs: 1, passed: true, blocking: true } as never]),
    /Invalid agent event "tool_result".*command must contain at least 1/
  );
});

test("agent event validator accepts a complete tool_result event", () => {
  const errors = validateAgentEvent({
    type: "tool_result",
    protocolVersion: "0.2",
    schemaVersion: "crx.agent.v0.2",
    name: "lint",
    command: ["npm", "run", "lint"],
    exitCode: 0,
    durationMs: 10,
    passed: true,
    blocking: true,
    timedOut: false,
    stdout: "",
    stderr: ""
  });
  assert.deepEqual(errors, []);
});
