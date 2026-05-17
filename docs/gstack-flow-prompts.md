# gstack Flow Prompts

This file captures the best-practice gstack-style flow used to shape and build `crx`, a local CodeRabbit-style CLI reviewer powered by the user's authenticated Codex CLI subscription.

Use the steps in order. The important pattern is: clarify product truth first, challenge strategy, challenge developer experience, challenge engineering safety, then build only after the gates pass. After implementation, run review and ship gates instead of immediately polishing.

## 0. Shared Context Block

Paste this at the top of every step unless the tool already has equivalent context:

```text
Project: coderabbit-codex-clone
CLI binary: crx
Goal: Build a local CodeRabbit-style pre-commit review CLI that uses the user's authenticated Codex CLI subscription for AI inference. Do not call CodeRabbit APIs. Do not require OpenAI API keys.
Target runtime: Node.js + TypeScript, macOS/Linux first.
Core modes: plain output by default, --agent JSONL for coding agents, --interactive placeholder or MVP TUI.
Core commands: crx / crx review, crx auth status, crx config init.
Review scope: committed, uncommitted, all, base branch, base commit, repo directory, optional instruction files.
Safety: redact secrets, avoid shell injection, validate model JSON, report truncation, never auto-apply fixes in MVP.
Quality bar: useful to an agent loop before commit; critical/major findings should be actionable with fix instructions.
```

## 1. `/office-hours` Product Framing Prompt

```text
Use /office-hours on the shared context.

Demand reality. Do not accept vague claims like "CodeRabbit but local" unless they translate into a specific developer behavior.

Questions to answer:
1. Who is the exact first user? Pick one persona, not a broad market.
2. What job are they hiring `crx` to do before commit?
3. Why would they run `crx` locally instead of waiting for PR review or using official CodeRabbit CLI?
4. What is the narrowest useful wedge that can be delivered in one week?
5. What are explicit non-goals for the MVP?
6. What risks make this not worth building?
7. What would make the first run feel magical?

Evaluate the local-first Codex subscription angle honestly:
- Is avoiding separate API keys actually valuable?
- Is using Codex CLI subscription auth technically viable enough?
- Does this fit agent workflows better than a hosted reviewer?

Output exactly these sections:
- Reality check
- First persona
- Narrow wedge
- MVP promise
- Non-goals
- Adoption risks
- One-week scope
- Kill criteria

Be blunt. If the wedge is weak, say so and propose a smaller wedge.
```

## 2. `/plan-ceo-review` Strategy Prompt

```text
Use /plan-ceo-review on the shared context plus the /office-hours output.

Act as a skeptical product/strategy reviewer. Challenge whether this project should exist at all.

Specifically test:
1. Differentiation from official CodeRabbit CLI.
2. Differentiation from `codex exec review` or a generic review prompt.
3. Whether subscription-auth inference is enough of a wedge.
4. Whether the CLI can be useful without hosted PR context, org policy, or paid CodeRabbit features.
5. Whether the initial command surface is too broad.
6. Whether naming/positioning avoids impersonating CodeRabbit.
7. What should be deferred until after MVP.

Decision format:
- Approve / reject / approve with cuts
- Strategic thesis in one sentence
- Must-have scope
- Must-cut scope
- Positioning sentence for README
- Top three risks
- The single metric for MVP success

If you approve with cuts, be explicit about which commands/options stay in v0.1 and which move to later.
```

## 3. `/plan-devex-review` DX Prompt

```text
Use /plan-devex-review on the shared context plus approved strategy.

Review the developer experience as if you are a busy coding agent or engineer trying this in a fresh repo.

Inspect and specify:
1. Installation path: clone/build/link for now, eventual npm package later.
2. First successful command: `crx auth status` or `crx --help`.
3. Happy path: `crx review --agent` after code changes.
4. Plain output format for humans.
5. JSONL event contract for agents.
6. Exit code contract.
7. Error wording for missing git repo, missing Codex, invalid Codex output, no HEAD, and diff too large.
8. Config ergonomics: `crx config init`, `CRX_CODEX_COMMAND`, `crx.config.json`.
9. How long-running Codex reviews should communicate status.
10. Whether `--interactive` should exist in MVP or be a clear placeholder.

Require copy-pasteable examples.

Output exactly:
- First-run script
- Happy-path script
- Agent-mode contract
- Plain-mode contract
- Exit codes
- Error message rewrites
- DX blockers
- Acceptance criteria

Reject any design where an agent cannot reliably parse output or know whether critical/major issues remain.
```

## 4. `/plan-eng-review` Architecture Prompt

```text
Use /plan-eng-review on the shared context plus approved product and DX outputs.

Review the engineering design before implementation. Be adversarial about security and correctness.

Required modules to evaluate:
- CLI argument parser
- Config loader and config init
- Git repo detection
- Git diff command builder
- Diff truncation and truncation reporting
- Secret redaction
- Prompt builder
- Codex CLI adapter
- Codex auth probe
- JSON parser / validator / recovery
- Plain formatter
- JSONL formatter
- Tests

Critical questions:
1. Are all child processes spawned without shell string concatenation?
2. Does every git command run in the selected repo directory only?
3. Can extra config files escape the repo via `../` or path-prefix tricks?
4. Are secrets redacted before prompt construction?
5. Does truncation preserve a clear warning in both plain and JSONL contexts?
6. Does invalid model output become a controlled `error` event?
7. Are critical/major findings reflected in exit codes?
8. Can the Codex command be configured without opening command-injection holes?
9. Are tests focused on the risky surfaces instead of snapshots only?

Output exactly:
- Architecture verdict
- Module plan
- Data flow diagram in text
- Security review
- Test matrix
- Required fixes before coding
- Allowed deferrals

Reject the plan if it shells out unsafely, leaks secrets, trusts arbitrary JSON, or hides truncation.
```

## 5. `/autoplan` Combined Gate Prompt

```text
Use /autoplan with the shared context and any prior review outputs.

Run three gates in sequence and stop at the first failed gate:

Gate 1 — CEO/Product:
- Is the wedge specific?
- Is the first user clear?
- Is the MVP smaller than a full CodeRabbit replacement?
- Is the positioning honest?

Gate 2 — DevEx:
- Can a new user install, verify auth, and run a review quickly?
- Can a coding agent parse the JSONL contract deterministically?
- Are exit codes and errors useful?

Gate 3 — Engineering:
- Is the implementation safe around git, shelling out, secrets, truncation, and model output?
- Is the test plan sufficient?

If all gates pass, produce a build plan in this format:
1. Scaffold package
2. Implement core types and config
3. Implement git diff collection
4. Implement redaction
5. Implement Codex adapter
6. Implement parser and formatters
7. Wire CLI commands
8. Add docs
9. Add tests
10. Verify and ship

For each milestone include files to create, acceptance checks, and likely failure modes.
```

## 6. Implementation Prompt

```text
Build the MVP for `coderabbit-codex-clone` now.

Follow the approved build plan. Use TypeScript + Node.js. Keep dependencies minimal.

Implement:
- `package.json` with binary `crx`
- `tsconfig.json`
- `src/cli.ts`
- `src/types.ts`
- `src/config.ts`
- `src/git.ts`
- `src/redact.ts`
- `src/prompt.ts`
- `src/codex.ts`
- `src/parser.ts`
- `src/format.ts`
- focused tests under `test/`
- `README.md`
- `docs/architecture.md`
- `docs/gstack-flow-prompts.md`

CLI requirements:
- `crx` defaults to `review`
- `crx review`
- `crx review --agent`
- `crx review --plain`
- `crx review --interactive` as clear MVP placeholder with non-zero exit
- `crx auth status`
- `crx config init`
- `--type all|committed|uncommitted`
- `--base <branch>`
- `--base-commit <sha>`
- `--dir <path>`
- `--config <files...>`
- `--max-diff-bytes <n>`
- `--no-color`

Codex requirements:
- Default command: `npx -y @openai/codex`
- Override with `CRX_CODEX_COMMAND`
- Override with config `codexCommand`
- Use `codex exec` non-interactively
- Run with selected repo as cwd
- Do not require OpenAI API keys

Output requirements:
- Plain mode groups findings by severity and includes fix instructions.
- Agent mode emits one JSON object per line.
- Events: `review_context`, `status`, `finding`, `complete`, `error`.
- Finding fields: severity, fileName, lineStart, lineEnd, title, message, impact, codegenInstructions, suggestions.

Safety requirements:
- Redact dotenv secrets, common API tokens, and private keys before sending to Codex.
- Use spawn/execFile-style argument arrays; no shell concatenation.
- Prevent `--config` path traversal outside repo.
- Report diff truncation.
- Validate/recover JSON defensively.
- Never auto-apply fixes.

Verification:
- Run `npm install`.
- Run `npm test`.
- Run `npm run build`.
- Run `node dist/cli.js help`.
- Run `node dist/cli.js auth status` if Codex auth is available.

Commit only if tests and build pass.
```

## 7. `/review` Production Review Prompt

```text
Use /review on the implemented repository.

Review for production bugs only. Ignore style nits unless they hide correctness risk.

Focus areas:
1. Command injection in Codex command handling.
2. Git command safety and cwd handling.
3. `--config` path traversal and symlink/path-prefix edge cases.
4. Secret redaction gaps before prompt construction.
5. Diff truncation correctness and user visibility.
6. No-HEAD repositories and first-commit behavior.
7. Invalid JSON / markdown JSON / partial JSON recovery.
8. Exit code correctness for blocking findings.
9. Agent JSONL parseability.
10. Child-process timeouts and stderr reporting.
11. Package build output matching `bin.crx`.
12. Whether docs overclaim compared with implementation.

Return findings only if actionable. Use this schema:
- severity: critical | major | minor | trivial | info
- file
- line
- title
- impact
- fix instructions

If no critical/major findings remain, say so clearly and list only worthwhile follow-ups.
```

## 8. CodeRabbit-Style Self-Review Loop Prompt

```text
Run a local self-review loop using `crx` itself.

Steps:
1. Build the package.
2. Ensure there is a Git baseline. If this is the initial commit, either commit the baseline after tests pass or run against a repo with HEAD.
3. Run: `node dist/cli.js review --agent --max-diff-bytes 120000`.
4. Wait quietly. Codex-backed reviews can take several minutes.
5. Parse JSONL events exactly one line at a time.
6. Fix only `critical` and `major` findings.
7. Rerun once.
8. After the second pass, stop. Do not chase minor/trivial nits unless they indicate real production risk.

Summarize:
- First pass findings
- Fixes applied
- Second pass findings
- Remaining accepted limitations
- Whether the package is ready to ship
```

## 9. `/ship` Prompt

```text
Use /ship on the repository.

Prepare `crx` for handoff/release. Do not publish externally unless explicitly approved.

Required checks:
1. `npm test`
2. `npm run build`
3. `node dist/cli.js help`
4. `node dist/cli.js auth status` if Codex auth is configured
5. Inspect `package.json` bin path exists after build
6. Confirm `node_modules` and `dist` are not accidentally committed unless intentionally chosen
7. Confirm no secrets in repo
8. Confirm no CodeRabbit API calls
9. Confirm no OpenAI API key requirement
10. Confirm README examples match actual CLI
11. Confirm docs mention MVP limitations honestly

Output:
- Ship verdict
- Checks run and results
- Files changed
- Known limitations
- Recommended next tasks
- Whether commit/push was performed

If any required check fails, stop and fix before committing.
```
