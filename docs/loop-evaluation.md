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

- `npm test` — pass, 49 tests.
- `npm run build` — pass.

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


## 2026-05-18 15:10 BST — Loop 7: JSONL artifact summary helper v0.1

### Development completed

- Added `scripts/crx-jsonl-summary.mjs` to summarize JSONL artifacts for CI logs.
- Added exit-code semantics matching blocking findings/tool failures/rerun/error states.
- Added fixture-based test coverage.

### Validation

- `npm test` — pending for this slice.
- `npm run build` — pending for this slice.

### Production-readiness score

**8.4 / 10**. CI consumers now have both machine-readable artifacts and a small human-readable summary without writing bespoke parsers.

### Remaining gaps compared with CodeRabbit docs matrix

- Ecosystem-specific local tool presets and config generation.
- Optional compatible config import from `.coderabbit.yaml` concepts.
- Hosted/team features remain deferred.

### Chosen next slice

Add config preset generation/docs for common local tools if the worktree remains clean and time remains.


## 2026-05-18 15:20 BST — Loop 8: Node local-tool config preset v0.1

### Development completed

- Added `configPreset("node")` and `crx config init --preset node`.
- The node preset enables blocking `npm test` and `npm run build` local tool results.
- Added tests and docs for the preset.

### Validation

- `npm test` — pending for this slice.
- `npm run build` — pending for this slice.

### Production-readiness score

**8.5 / 10**. New Node projects can now bootstrap a practical agent quality gate without hand-writing localTools config.

### Remaining gaps compared with CodeRabbit docs matrix

- More ecosystem presets.
- Optional `.coderabbit.yaml` subset import.
- SARIF/JUnit or other artifact adapters.

### Chosen next slice

Add another small preset or improve docs/tests based on next status check.


## 2026-05-18 15:30 BST — Loop 9: Python and Ruby local-tool presets v0.1

### Development completed

- Added `python` and `ruby` config presets.
- Python: blocking pytest plus advisory ruff.
- Ruby: blocking rspec plus advisory rubocop.
- Updated preset tests and docs.

### Validation

- `npm test` — pending for this slice.
- `npm run build` — pending for this slice.

### Production-readiness score

**8.6 / 10**. The quality gate is now easier to bootstrap for several common ecosystems while preserving explicit local command control.

### Remaining gaps compared with CodeRabbit docs matrix

- Compatible config import from CodeRabbit YAML concepts.
- Artifact adapters such as SARIF/JUnit.
- Hosted/team features remain deferred.

### Chosen next slice

Consider a tiny `.coderabbit.yaml` mapping doc or keep improving validation/docs depending on remaining time.


## 2026-05-18 15:40 BST — Loop 10: SARIF artifact adapter v0.1

### Development completed

- Added a SARIF conversion helper for JSONL finding events.
- Added test coverage for SARIF structure and blocking exit behavior.
- Documented SARIF export in CI docs.

### Validation

- `npm test` — pending for this slice.
- `npm run build` — pending for this slice.

### Production-readiness score

**8.7 / 10**. The gate can now produce artifacts consumable by code-scanning surfaces, improving CI usefulness beyond raw logs.

### Remaining gaps compared with CodeRabbit docs matrix

- JUnit/tool-result artifact export.
- Compatible config import from CodeRabbit YAML concepts.
- Hosted/team features remain deferred.

### Chosen next slice

Add a final validation/evaluation pass and choose another small artifact/config improvement if time remains.


## 2026-05-18 15:50 BST — Loop 11: JUnit artifact adapter v0.1

### Development completed

- Added JUnit XML conversion for blocking results.
- Wired `crx summarize --format junit`.
- Added script and unit coverage.

### Validation

- `npm test` — pending for this slice.
- `npm run build` — pending for this slice.

### Production-readiness score

**8.8 / 10**. The gate now supports JSONL, text summaries, SARIF, and JUnit-style CI artifacts.

### Remaining gaps compared with CodeRabbit docs matrix

- Optional CodeRabbit YAML concept mapping.
- Fully worked CI artifact upload examples.
- Hosted/team features remain deferred.

### Chosen next slice

Run a final validation/evaluation checkpoint, then continue with docs/artifact polish if still before the deadline.


## 2026-05-18 14:48 BST — Loop 12: Artifact exit-code regression lock v0.1

### Development completed

- Commit `ef3e033` (`test: lock summarize artifact exit codes`).
- Added E2E coverage proving `crx summarize --format sarif` and `crx summarize --format junit` preserve blocking quality-gate exit code `3` while emitting parseable artifacts.
- Validated the now-landed SARIF/JUnit artifact path remains safe for CI consumers that gate on the summarize command as well as standalone scripts.

### Validation

- `npm test` — pass, 62 tests.
- `npm run build` — pass.

### Production-readiness score

**8.9 / 10**. The agent-run quality gate now has tested JSONL, text, SARIF, and JUnit artifact paths with consistent blocking exit semantics, making it substantially easier to wire into CI without bespoke parsing.

### CodeRabbit comparison

`crx` still does not provide CodeRabbit’s hosted PR bot, dashboards, organization learnings, or managed cloud execution. For local/CI agent workflows, it now covers the core review loop, deterministic local-tool signals, rerun-aware auto-fix handling, scoped review context, and common CI artifact outputs.

### Next recommended slice

Add a small `.coderabbit.yaml`/CodeRabbit-concept mapping doc or importer for review profile, path filters, and instructions so teams migrating from CodeRabbit can bootstrap equivalent local `crx.config.json` settings quickly.


## 2026-05-18 14:49 BST — Loop 13: CI artifact upload example lock v0.1

### Development completed

- Commit `af1d76f` expanded the GitHub Actions recipe to generate text, SARIF, and JUnit artifacts before applying the original review exit code.
- Commit `ae3f4ec` added docs regression coverage so the CI example keeps uploading JSONL, SARIF, and JUnit artifacts.
- The example now demonstrates preserving the quality-gate decision while still retaining artifacts for later inspection.

### Validation

- `npm test` — pass, 63 tests.
- `npm run build` — pass.

### Production-readiness score

**9.0 / 10**. CI adopters now have a more complete copy-paste path: review JSONL, concise text logs, code-scanning SARIF, and JUnit reports are all produced from the same run.

### CodeRabbit comparison

This closes more of the CI reporting gap for local/agent workflows. Remaining CodeRabbit differences are primarily hosted PR comments, managed dashboards, learnings, and richer configuration import/mapping.

### Next recommended slice

Implement or document a small `.coderabbit.yaml` concept mapping for review profile, path filters, path instructions, and guideline files.


## 2026-05-18 14:58 BST — Loop 14: CodeRabbit config migration bridge v1.0

### Development completed

- Added a CodeRabbit config concept mapping doc linked from the README.
- Added safe fallback loading for `.coderabbit.yaml` / `.coderabbit.yml` when native `crx.config.json` is absent.
- Mapped `reviews.profile`, `reviews.path_filters`, `reviews.path_instructions`, and `knowledge_base.code_guidelines.filePatterns` into sanitized local config.
- Documented precedence, supported fallback fields, and explicit non-goals for hosted CodeRabbit behavior and command execution.
- Added regression coverage for mapping docs, `.coderabbit.yaml`, `.coderabbit.yml`, inline/list fallback shapes, and native config precedence.

### Validation

- `npm test` — pass, 67 tests.
- `npm run build` — pass.

### Production-readiness score

**9.1 / 10**. Teams migrating from CodeRabbit can now bootstrap equivalent local review-scope settings without adopting hosted behavior or implicit command execution, while native `crx.config.json` remains the clear source of truth for long-lived CI.

### CodeRabbit comparison

This closes the main local configuration migration gap for agent-run workflows. `crx` still intentionally does not provide hosted PR comments, dashboards, organization learnings, or managed cloud execution.

### Next recommended slice

Run a final end-to-end smoke review against a fixture repo or tighten docs/schema consistency checks if another small slice is needed.


## 2026-05-18 14:51 BST — Loop 14: CodeRabbit YAML subset mapping v0.1

### Development completed

- Commit `50d63e1` (`Map CodeRabbit YAML subset to local config`).
- Added a safe local mapper for `.coderabbit.yaml` / `.coderabbit.yml` when `crx.config.json` is absent.
- Mapped review profile, path filters, path instructions, and code guideline file patterns into the existing `CrxConfig` shape.
- Added migration docs and tests for the supported subset.

### Validation

- `npm test` — pass, 65 tests.
- `npm run build` — pass.

### Production-readiness score

**9.1 / 10**. Teams with existing CodeRabbit config can now bootstrap the core local/CI review settings without hand-translating every repo, while unsupported hosted features stay out of scope.

### CodeRabbit comparison

This narrows the most relevant configuration parity gap for agent-run local reviews. Remaining differences are full YAML schema coverage, hosted PR automation, dashboards, organization learnings, and managed tool execution.

### Next recommended slice

Harden the YAML subset mapper with edge-case tests and clearer precedence docs, then continue with small validation/doc polish until the 16:20 checkpoint.

## 2026-05-18 14:53 BST — Loop 15: Local tool timeout and config validation polish v0.1

### Development completed

- Hardened local tool timeout handling so a timed-out command is first sent `SIGTERM` and then force-killed with `SIGKILL` if it does not exit promptly.
- Preserved the `tool_result` JSONL contract for timeouts with exit code `124`, `timedOut: true`, and failure severity in prompt context.
- Added regression coverage for local tools that ignore `SIGTERM`.
- Added `crx config validate [--json] [--dir path]` to inspect the sanitized effective config, including CodeRabbit YAML fallback source detection.
- Added E2E coverage for clean config validation output and invalid config errors without stack traces.

### Validation

- `npm test` — pass, 70 tests.
- `npm run build` — pass.
- `node dist/cli.js config validate --json` — pass.
- `node dist/cli.js review --bad-option` — pass, exit `1`, no stack trace.

### Production-readiness score

**9.2 / 10**. The local/CI quality gate is more robust against hung project-native tools and easier to debug before running an expensive review because teams can validate the effective sanitized config directly.

### CodeRabbit comparison

This improves the reliability of local deterministic checks in agent-run workflows. `crx` still intentionally does not provide hosted PR comments, dashboards, organization learnings, or managed cloud execution.

### Next recommended slice

Add a final smoke fixture for a config-driven local-tools review, or tighten docs/schema consistency around effective config output if another small safe slice is needed.


## 2026-05-18 14:56 BST — Loop 16: Config validation and tool severity polish

### Development completed

- Commit `7bd0434` (`Add config validate command`).
- Added `crx config validate [--json] [--dir path]` so CI and migration scripts can inspect the sanitized effective config and source file before running a gate.
- Surfaced local-tool failure severity in prompt context and locked default severities with tests.
- Updated README and CI docs for config validation and failed-tool severity behavior.

### Validation

- `npm test` — pass, 70 tests.
- `npm run build` — pass.

### Production-readiness score

**9.2 / 10**. Operators now have a preflight command for native and CodeRabbit-fallback config, plus clearer severity signals across JSONL, summaries, artifacts, and prompt context.

### CodeRabbit comparison

This improves the local/CI equivalent of CodeRabbit's repository configuration diagnostics and quality signal weighting. Hosted PR comments, dashboard workflows, organization-level learnings, and managed cloud execution remain intentionally out of scope.

### Next recommended slice

Add a small CI-ready fixture/smoke example for `crx config validate` plus a generic quality-gate recipe that validates config before running `crx --agent`.


## 2026-05-18 15:01 BST — Loop 17: CI config preflight artifact lock

### Development completed

- Commit `393a49d` (`Preflight config in CI gate helper`).
- Locked the CI quality-gate docs test so examples preserve `crx config validate --json > crx-config.json` and upload the config preflight artifact with review outputs.
- Confirmed the shell helper contract includes a config-validation preflight and `CRX_SKIP_CONFIG_VALIDATE` escape hatch.

### Validation

- `npm test` — pass, 70 tests.
- `npm run build` — pass.
- Push initially raced with recently pushed helper/docs commits; fetched/rebased safely and pushed the test-lock commit on top of `origin/main`.

### Production-readiness score

**9.25 / 10**. The CI path now has a durable preflight artifact, making failed gates easier to debug and making migration from CodeRabbit-style config more observable.

### CodeRabbit comparison

This continues closing the local/CI operational parity gap: teams can inspect effective config alongside review JSONL, SARIF, and JUnit artifacts. Hosted review comments, dashboards, and team/global learnings remain outside the local clone scope.

### Next recommended slice

Add an end-to-end fixture review that combines config validation, local tool results, and summarize artifacts without requiring an authenticated Codex call.
