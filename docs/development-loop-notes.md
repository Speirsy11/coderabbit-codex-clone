# Development Loop Notes

## 2026-05-18 14:22–14:35 BST — Agent gate hardening v0.2

Evaluation source: `docs/current-capability-audit.md` recommended first slice and `docs/coderabbit-feature-matrix.md` Slice 1.

Implemented:

- Fixed async CLI error handling so invalid review args are caught by the top-level boundary.
- Made `crx --help` and `crx review --help` exit cleanly.
- Added versioned JSONL agent protocol fields: `protocolVersion: "0.2"`, `schemaVersion: "crx.agent.v0.2"`.
- Added `docs/agent-contract.md` with event schemas, stdout/stderr contract, exit codes, and recommended agent loop.
- Suppressed normal progress stderr in `--agent` mode so stdout remains JSONL and stderr stays quiet.
- Added E2E CLI tests with mocked Codex for help, invalid args, zero findings, blocking findings, invalid JSON, and auto-fix patch application.
- Included small untracked text files in `all`/`uncommitted` review diffs and reports included/skipped paths in JSONL context/warning events.
- Changed successful auto-fix semantics to exit `4` with `needsRerun: true` instead of treating patch application as a clean pass.
- Updated README and architecture docs for current auto-fix and exit-code behavior.

Validation:

- `npm test` passed: 29/29.
- `npm run build` passed.

Next evaluation focus:

- Re-read feature matrix/current audit and choose the next P0 gap after Slice 1. Likely candidates: path filters/instructions and auto-detected guideline files from Slice 2, or base-branch remediation if quality-gate reliability seems higher impact.

## 2026-05-18 14:35–14:45 BST — Review scope and instructions v0.3

Evaluation source: `docs/coderabbit-feature-matrix.md` Slice 2 and the updated audit's remaining P0 gap.

Implemented:

- Added default path filters for dependency, build, generated, lock, source-map, minified, media, and archive artifacts.
- Added config-driven `pathFilters` and glob-scoped `pathInstructions`.
- Added auto-loading for common local guideline files: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and `.github/copilot-instructions.md`, plus configured `codeGuidelines.filePatterns`.
- Added `excludedFiles` and `instructionFiles` to agent `review_context`; path-filter skips emit warning events.
- Added scope unit tests and an E2E prompt-capture test proving excluded files are omitted, guideline text is loaded, and matching path instructions reach the prompt.
- Updated README, architecture docs, and agent contract for scope/instruction behavior.

Validation:

- `npm test` passed: 35/35.
- `npm run build` passed.

Next likely gaps:

- Friendlier base-branch/remediation behavior for shallow/fresh clones.
- Optional worktree status events around auto-fix.
- CI examples and documented shell/GitHub Actions usage.

## 2026-05-18 14:45–14:55 BST — Auto-fix worktree observability v0.4

Evaluation source: current audit gap about missing pre/post worktree status and changed-file reporting for auto-fix.

Implemented:

- Added `worktree_status` JSONL events before and after auto-fix attempts, using raw `git status --porcelain=v1` entries.
- Added `changedFiles` to `autofix` events and `AutoFixResult`, derived from the generated patch.
- Added tests for patch changed-file extraction and E2E auto-fix status events.
- Updated README, architecture docs, and agent contract for the new event.

Validation:

- `npm test` passed: 36/36.
- `npm run build` passed.

Next likely gap:

- Friendlier base-branch/shallow-clone remediation, or CI examples for GitHub Actions/generic shell.

## 2026-05-18 14:55–15:00 BST — Base diff remediation v0.5

Evaluation source: current audit gap about brittle `--base` behavior in shallow/fresh clones.

Implemented:

- Added a friendly base/base-commit diff error when `git diff base...HEAD` fails.
- The error includes the target ref, raw Git message, likely shallow/unfetched-branch cause, a `git fetch origin <base> --depth=50` remediation for branch bases, and a GitHub Actions `fetch-depth: 0` note.
- Added a regression test for missing/unfetched base remediation text.

Validation:

- `npm test` passed: 39/39.
- `npm run build` passed.

Next likely gap:

- Review current docs again and choose remaining highest-impact quality-gate gap; likely schema/docs polish or stricter config validation.

## 2026-05-18 15:00–15:10 BST — Local tool signal + config validation v0.6

Evaluation source: feature matrix P1 local linter/security-tool gap and current audit notes on stricter config validation.

Implemented:

- Added opt-in `localTools` config entries with name, command, blocking, timeout, and output-limit controls.
- Local tools run with `shell: false`, emit `tool_result` JSONL events, and their summarized output is included in the Codex review prompt.
- Blocking local tool failures make the gate exit `3`; non-blocking failures remain advisory.
- Config loading now rejects invalid JSON and sanitizes supported fields instead of blindly spreading arbitrary repo config.
- Added unit and E2E tests for tool execution, blocking behavior, config sanitization, and invalid JSON handling.

Validation:

- `npm test` passed: 45/45.
- `npm run build` passed.

Next likely gap:

- Runtime JSON Schema validation or further schema/docs alignment for agent consumers.

## 2026-05-18 15:30–15:40 BST — Node local-tool config preset v0.9

Evaluation source: remaining gap for common local-tool presets/examples after generic `localTools` support landed.

Implemented:

- Added `crx config init --preset node` to generate blocking `npm test` and `npm run build` local tools.
- Added `configPreset()` and tests verifying generated preset commands load correctly.
- Updated README and CI docs with the preset workflow.

Validation:

- `npm test` passed.
- `npm run build` passed.

Next likely gap:

- More preset coverage only if needed; otherwise focus on docs/schema consistency and polish.

## 2026-05-18 15:40–15:50 BST — Finding categories v1.0

Evaluation source: feature-matrix gap for CodeRabbit-style review types: potential issues, refactor suggestions, and nitpicks.

Implemented:

- Added optional finding `category`: `potential_issue`, `refactor_suggestion`, or `nitpick`.
- Prompt now asks Codex to classify findings by category in addition to severity.
- Parser preserves valid categories and defaults missing categories to `potential_issue` for critical/major findings and `nitpick` otherwise.
- Agent event schema and runtime validation now accept category values.
- Added parser tests and contract docs.

Validation:

- `npm test` passed.
- `npm run build` passed.

Next likely gap:

- Optional `.coderabbit.yaml` subset mapping/import docs, or artifact adapters such as SARIF/JUnit.
