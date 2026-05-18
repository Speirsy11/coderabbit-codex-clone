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

## 2026-05-18 15:50–16:00 BST — SARIF summary export v1.1

Evaluation source: remaining artifact-adapter gap after JSONL summaries and local-tool presets.

Implemented:

- Added `crx summarize --format sarif <jsonl>` to convert agent findings to SARIF 2.1.0.
- SARIF results preserve severity, category, impact, fix instructions, suggestions, file, and line metadata.
- Added unit and E2E coverage for SARIF conversion.
- Updated README and CI docs with the export command.

Validation:

- `npm test` passed: 58/58.
- `npm run build` passed.

Next likely gap:

- Optional `.coderabbit.yaml` subset mapping/import docs or JUnit/tool-result artifact export.

## 2026-05-18 16:00–16:05 BST — JUnit summary export v1.2

Evaluation source: artifact-adapter gap for CI systems that render test reports rather than SARIF/code scanning.

Implemented:

- Added `crx summarize --format junit <jsonl>` to convert blocking findings and blocking local tool failures into JUnit XML.
- Clean artifacts emit a passing `crx:pass` test case; blockers become failing test cases.
- Added unit and E2E coverage for JUnit conversion.
- Updated README and CI docs.

Validation:

- `npm run build` passed.
- `npm test` passed: 59/59.

Next likely gap:

- Optional `.coderabbit.yaml` subset mapping/import docs, or artifact examples in GitHub Actions.

## 2026-05-18 14:55 BST — CodeRabbit config concept mapping v0.1

Evaluation source: remaining parity gap around `.coderabbit.yaml` concepts after local config, presets, and artifacts landed.

Implemented:

- Added a focused mapping doc for supported CodeRabbit concepts and `crx.config.json` equivalents.
- Documented an example migration for review profile, path instructions, and guideline file patterns.
- Added tests that keep the mapping doc anchored to the key local config fields.

Validation:

- `npm test` passed.
- `npm run build` passed.

Next likely gap:

- Optional safe subset importer or additional CI provider examples if time remains.

## 2026-05-18 16:05–16:15 BST — CodeRabbit YAML subset mapping v1.0

Evaluation source: matrix/audit gap for compatible `.coderabbit.yaml` concepts without depending on hosted CodeRabbit behavior.

Implemented:

- If `crx.config.json` is absent, `loadConfig()` now reads `.coderabbit.yaml` / `.coderabbit.yml`.
- Added a dependency-free YAML subset parser for known local review fields.
- Mapped `reviews.profile`, `reviews.path_filters`, `reviews.path_instructions`, and `knowledge_base.code_guidelines.filePatterns` into the existing sanitized crx config.
- Hosted-only settings remain ignored; local tool commands still live in native `crx.config.json`.
- Added config-loader tests and README/CI docs.

Validation:

- `npm test` passed: 65/65.
- `npm run build` passed.

Next likely gap:

- Stronger docs/schema consistency checks or GitHub Actions examples that upload SARIF/JUnit artifacts end-to-end.

## 2026-05-18 16:15 BST — Local tool failure severity v1.0

Evaluation source: audit gap for deeper tool-result severity mapping after artifact exporters were added.

Implemented:

- Added optional `localTools[].failureSeverity` with the same severity taxonomy as findings.
- Failed `tool_result` events now include `severity` for JSONL/artifact consumers.
- Defaults are `major` for blocking tools and `minor` for non-blocking tools.
- Summary and JUnit output now show failed-tool severity.
- Updated schema, runtime event validation, config sanitizer, README, CI docs, agent contract, and tests.

Validation:

- `npm run build` passed.
- `npm test` passed: 69/69.

Next likely gap:

- Schema/docs consistency checks, generated validator exploration, or additional CI publishing examples.

## 2026-05-18 14:53 BST — Config validate preflight v1.0

Evaluation source: schema/docs/config consistency gap after adding native and CodeRabbit-style config paths.

Implemented:

- Added `crx config validate [--json] [--dir path]`.
- The command loads the same effective config used by review, reports the source file or defaults, and prints sanitized config with `--json`.
- Invalid native config JSON exits cleanly with the existing controlled error path.
- Added E2E tests and docs for CI preflight usage.

Validation:

- `npm test` passed: 70/70.
- `npm run build` passed.

Next likely gap:

- Final smoke review / docs consistency pass, or handoff at the requested checkpoint if wall-clock time has arrived.

## 2026-05-18 14:56 BST — Quality gate config preflight v1.1

Evaluation source: after adding `crx config validate`, wire it into the reusable CI helper so agents catch config problems before expensive reviews.

Implemented:

- `scripts/crx-quality-gate.sh` now runs `crx config validate --json` before `crx review --agent`.
- Writes the preflight artifact to `crx-config.json` by default.
- Added `CRX_CONFIG_OUT` and `CRX_SKIP_CONFIG_VALIDATE=1` controls for CI customization.
- Updated CI docs.

Validation:

- `npm test` passed: 70/70.
- `npm run build` passed.

Next likely gap:

- Final smoke review or docs consistency pass.

## 2026-05-18 14:58 BST — Agent contract docs/schema consistency lock v1.0

Evaluation source: remaining schema/docs consistency gap after multiple JSONL contract extensions.

Implemented:

- Added tests that parse every JSON example in `docs/agent-contract.md` and validate it with the runtime agent event validator.
- Added a schema enum order check against the documented event order.
- Aligned schema event ordering with the contract docs and actual review stream order.

Validation:

- `npm test` passed: 72/72.
- `npm run build` passed.

Next likely gap:

- Final end-to-end smoke review or stop/handoff at checkpoint.

## 2026-05-18 15:00 BST — Review context config source v1.0

Evaluation source: after adding native plus CodeRabbit fallback config, agents need to know which config source shaped a review.

Implemented:

- Added optional `review_context.configSource` to JSONL output.
- Values identify `crx.config.json`, `.coderabbit.yaml`, or `.coderabbit.yml` when present.
- Updated runtime validation, JSON schema, agent contract docs, and E2E coverage.

Validation:

- `npm test` passed: 72/72.
- `npm run build` passed.

Next likely gap:

- Final smoke review / generated-schema validator exploration.

## 2026-05-18 15:02 BST — Complete event blocker counts v1.0

Evaluation source: final agent ergonomics pass after artifacts and config-source reporting. Agents should not need to re-count events to route pass/fail summaries.

Implemented:

- Added optional `blockingFindingsCount` and `blockingToolsCount` to `complete` events.
- Review completion now populates both counts.
- Updated runtime validation, JSON schema, agent contract docs, and E2E assertions.

Validation:

- `npm test` passed: 72/72.
- `npm run build` passed.

Next likely gap:

- Final smoke review or generated-schema validator exploration.
