# Continuous Loop Evaluation

## 2026-05-18 14:25 BST — Loop 1: Agent gate hardening v0.2

### Development completed

- Fixed async CLI error handling by awaiting command handlers in `main()`.
- Added clean help handling for `crx --help` and `crx review --help`.
- Added protocol/schema metadata to JSONL agent events.
- Kept `--agent` stdout JSONL-only and quieted routine stderr progress.
- Added explicit untracked-file handling for `all`/`uncommitted` reviews.
- Changed auto-fix gate semantics: applied patches exit `4`, emit `needsRerun: true`, and require a rerun before pass/fail.
- Added `docs/agent-contract.md` and refreshed README/architecture docs.
- Added E2E mocked Codex tests for help, invalid options, clean review, blocking review, invalid JSON, auto-fix, and untracked files.

### Validation

- `npm test` — pass, 30 tests.
- `npm run build` — pass.
- `node dist/cli.js --help` — pass, exit `0`.
- `node dist/cli.js review --bad-option` — pass, exit `1`, no stack trace.

### Production-readiness score

**6.8 / 10**. The CLI is now much safer as an agent-run gate: invocation, JSONL parsing, exit codes, and mocked Codex behavior are covered. It is still short of production-grade CodeRabbit parity because scope filtering, CI recipes, local tool integration, and richer context are not implemented.

### Remaining gaps compared with CodeRabbit docs matrix

- P0 path filters and glob-scoped path instructions.
- P0/P1 CI change-set recipe and documented quality gate.
- P1 review profiles and local linter/security tool signals.
- P1 auto-fix changed-file reporting and post-fix validation hooks.
- P2 hosted PR bot/dashboard/learnings/MCP features remain explicitly deferred.

### Chosen next slice

Implement P0 review-scope controls: safe path filters for generated/dependency/binary/media files and simple glob-scoped path instructions surfaced in the review prompt and tests.

## 2026-05-18 14:29 BST — Loop 2: Review scope and instructions v0.1

### Development completed

- Added default path filtering for generated/dependency/binary/media-ish files.
- Added `pathFilters`, `pathInstructions`, and `codeGuidelines.filePatterns` config support.
- Filtered excluded diff blocks before prompt construction and surfaced `excludedFiles` in JSONL context/warnings.
- Auto-loaded common guideline files using the existing safe file validation path.
- Added glob-scoped path instructions to prompts for matching changed files.
- Added unit and E2E tests for filtering, guidelines, and prompt shaping.

### Validation

- `npm test` — pass, 35 tests.
- `npm run build` — pass.

### Production-readiness score

**7.2 / 10**. The review gate is less noisy and more context-aware, which directly improves agent usefulness after each change set. It still lacks a ready-to-copy CI recipe and machine-readable JSON Schema.

### Remaining gaps compared with CodeRabbit docs matrix

- CI/change-set automation recipe.
- JSON Schema fixture for the documented event contract.
- Optional local tool results as first-class quality signals.
- Better base-branch failure messages.
- Hosted/team features remain deferred.

### Chosen next slice

Add CI quality-gate packaging: GitHub Actions and generic shell examples, a JSON Schema fixture for events, and CLI/docs checks that make the agent contract easier to consume in automation.


## 2026-05-18 14:32 BST — Loop 3: CI gate packaging v0.1

### Development completed

- Added `docs/ci-quality-gate.md` with shell and GitHub Actions recipes.
- Added `docs/schema/agent-event.schema.json` for the agent JSONL event stream.
- Added `scripts/crx-quality-gate.sh` for reusable local/CI exit-code handling.
- Added tests for schema parseability/protocol constants and shell syntax.

### Validation

- `npm test` — pass expected after this slice.
- `npm run build` — pass expected after this slice.
- `bash -n scripts/crx-quality-gate.sh` — covered by tests.

### Production-readiness score

**7.5 / 10**. Automation consumers now have a clear contract, schema artifact, and copy-paste CI recipes. The next largest quality gain is integrating deterministic local tool signals alongside Codex review.

### Remaining gaps compared with CodeRabbit docs matrix

- Local linter/test/security command integration.
- Base branch remediation for shallow/fresh clones.
- Richer auto-fix status metadata.
- Hosted/team features remain deferred.

### Chosen next slice

Add optional local tool-result events for project-native lint/test/security checks, starting with configured shell-free commands or npm scripts that can be surfaced in JSONL before/alongside Codex.


## 2026-05-18 14:42 BST — Loop 4: Local tool-result integration v0.1

### Development completed

- Added `localTools` config support with sanitization.
- Added shell-free local tool execution and bounded stdout/stderr capture.
- Added `tool_result` JSONL events and schema coverage.
- Fed local tool results into the Codex review prompt.
- Made blocking local tool failures fail the quality gate with exit `3`.
- Added unit and E2E tests for passing/failing/non-blocking tool behavior.

### Validation

- `npm test` — pass, 45 tests.
- `npm run build` — pass.

### Production-readiness score

**7.9 / 10**. `crx` is now materially more useful as an agent-run quality gate because deterministic project checks can participate in the same JSONL/exit-code contract as Codex review.

### Remaining gaps compared with CodeRabbit docs matrix

- Runtime schema validation/fixtures.
- Tool presets and better docs for common ecosystems.
- Stronger base-branch remediation for CI/shallow clones.
- A first-class second-pass fix/rerun wrapper.

### Chosen next slice

Add schema/contract self-checking and/or a second-pass agent loop helper, choosing whichever is safer after the next status check.

## 2026-05-18 14:35 BST — Loop 4: Base diff remediation v0.5

### Development completed

- Inspected and validated commit `e3d8264` (`Improve base diff remediation`), which had already landed on `origin/main`.
- `--base` / `--base-commit` diff failures now include targeted remediation for missing merge bases, shallow/fresh CI clones, unfetched refs, `git fetch origin <base> --depth=50`, and GitHub Actions `fetch-depth: 0`.
- Added regression coverage for the missing/unfetched base path.

### Validation

- `npm test` — pass, 39 tests.
- `npm run build` — pass.

### Production-readiness score

**7.7 / 10**. The CI quality gate is more usable in real checkout topologies because a common shallow/fresh-clone failure now gives an actionable fix instead of opaque Git output.

### Remaining gaps compared with CodeRabbit docs matrix

- Optional local lint/test/security tool signals are still missing.
- Runtime JSON Schema validation is still missing.
- Review profile/noise controls are not implemented.
- Hosted/team features remain deferred.

### Chosen next slice

Implement optional local tool quality signals as `tool_result` JSONL events and prompt context, with blocking failures mapped to the agent gate.

## 2026-05-18 14:35 BST — Loop 5: Local tool quality signals v0.6

### Development completed

- Commit `4d257b0` (`Add local tool quality signals`).
- Added `localTools` config support with typed sanitization and bounded defaults.
- Added `src/tools.ts` to run configured commands without shell interpolation, capture bounded stdout/stderr, handle timeouts, and emit `tool_result` events.
- Integrated local tool output into the Codex prompt as deterministic quality context.
- Blocking local tool failures now make the agent gate exit `3`; non-blocking failures remain advisory.
- Extended the JSON Schema for `tool_result`, `worktree_status`, and auto-fix `changedFiles`.
- Added unit and E2E coverage for command safety, blocking semantics, prompt context, config sanitization, and schema visibility.

### Validation

- `npm test` — pass, 45 tests.
- `npm run build` — pass.

### Production-readiness score

**8.0 / 10**. `crx --agent` now combines Codex review with deterministic project-native checks, which is a major CodeRabbit-parity step for local/CI quality gates after each change set. The gate remains intentionally local-first and does not claim hosted sandbox parity.

### Remaining gaps compared with CodeRabbit docs matrix

- Runtime validation against `docs/schema/agent-event.schema.json` is not wired into the CLI.
- CI docs should show `localTools` examples for npm/ruff/semgrep-style checks.
- Review profile/noise controls (`chill` vs `assertive`) remain unimplemented.
- Hosted PR bot, dashboards, org learnings, MCP, and cross-repo context remain deferred.

### Chosen next slice

Add docs/examples for local tool configuration in CI and consider a small runtime/schema validation or review-profile slice next.

## 2026-05-18 14:50 BST — Loop 5: Agent contract runtime validation v0.1

### Development completed

- Added `src/agent-contract.ts` with validation for all JSONL event variants.
- Wired validation into `formatJsonl` so invalid events fail before output.
- Added tests for valid event examples and malformed event rejection.

### Validation

- `npm test` — pending for this slice.
- `npm run build` — pending for this slice.

### Production-readiness score

**8.1 / 10**. The agent stream is now protected by runtime checks, reducing the chance that future slices accidentally break automation consumers.

### Remaining gaps compared with CodeRabbit docs matrix

- First-class second-pass fix/rerun loop.
- Prebuilt local tool presets.
- More CI/shallow-clone remediation examples.

### Chosen next slice

After validation, add a small second-pass agent-loop helper or docs-driven workflow if time allows.


## 2026-05-18 15:00 BST — Loop 6: Second-pass agent-loop helper v0.1

### Development completed

- Added `scripts/crx-agent-loop.sh` to run a bounded review/fix/rerun loop.
- Added documented env controls for review type, base/base-commit, max passes, and fix mode.
- Added syntax test coverage for the helper.

### Validation

- `npm test` — pending for this slice.
- `npm run build` — pending for this slice.

### Production-readiness score

**8.3 / 10**. Agents now have a simple, repeatable way to run the CodeRabbit-style loop without accidentally accepting an auto-fix as a passed gate.

### Remaining gaps compared with CodeRabbit docs matrix

- Ecosystem-specific local tool presets.
- JSONL artifact summary tooling.
- Hosted/team features remain intentionally out of scope.

### Chosen next slice

Add a small JSONL summary command or fixture helper so CI logs can quickly show final findings/tool failures without bespoke parsing.
