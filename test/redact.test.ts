import test from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../src/redact.js";

test("redacts common tokens and dotenv secrets", () => {
  const input = "+OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz\nconst t='ghp_abcdefghijklmnopqrstuvwxyz123456';";
  const out = redactSecrets(input);
  assert(!out.includes("sk-abcdefghijklmnopqrstuvwxyz"));
  assert(!out.includes("ghp_abcdefghijklmnopqrstuvwxyz123456"));
  assert.match(out, /OPENAI_API_KEY=\[REDACTED\]/);
});

test("redacts private keys", () => {
  const out = redactSecrets("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----");
  assert.equal(out, "[REDACTED_PRIVATE_KEY]");
});
