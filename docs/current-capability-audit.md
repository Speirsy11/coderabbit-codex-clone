# Current Capability Audit

Date: 2026-05-18
Repository: `coderabbit-codex-clone`
Head: `1ee0264 feat: add TUI and autofix mode`

## Executive summary

`crx` is a compact, working TypeScript CLI that can collect a local Git diff, redact likely secrets, send a structured review prompt to the user's Codex CLI subscription, parse returned findings, and emit either human-readable output or JSONL events for agents. Recent work added a lightweight TUI summary and an opt-in Codex-generated auto-fix path that validates patches with `git apply --check` before applying them.

The project is useful as an experimental local reviewer today, but it is not yet a dependable agent-run quality gate after each change set. The main blockers are missing end-to-end CLI tests, brittle error handling around async command failures, weak JSONL/exit-code guarantees for auto-fix loops, shallow review scoping, and lack of a deterministic review fixture/mocking story for agents.

Production-readiness score: **5.5 / 10**.

## Implemented capabilities

### CLI commands and modes

- Binary: `crx` via `dist/cli.js`.
- Default command: `crx` / `crx review`.
- Supported commands:
  - `crx review`
  - `crx auth status`
  - `crx config init`
  - `crx help`, `crx -h`, `crx --help` as top-level commands only.
- Review output modes:
  - `--plain` default human format.
  - `--agent` JSONL events on stdout.
  - `--tui` / `--interactive` terminal summary with spinner and optional auto-fix prompt.
- Review selectors:
  - `-t/--type all|committed|uncommitted`
  - `--base <branch>`
  - `--base-commit <sha>`
  - `--dir <repo>`
  - `-c/--config <files...>`
  - `--max-diff-bytes <n>`

### Git diff collection

- Verifies the target directory is a Git repo with `git rev-parse --show-toplevel`.
- Uses `spawn(..., { shell: false })` for Git execution.
- Builds diffs for committed, uncommitted, all, base branch, and base commit modes.
- Has fallback handling for root commits.
- Avoids treating shallow non-root clones as root commits.
- Truncates large diffs and appends `[CRX_DIFF_TRUNCATED ...]` marker.

### Prompting and Codex integration

- Uses `npx -y @openai/codex` by default.
- Allows `CRX_CODEX_COMMAND` override.
- Honors repo-local `codexCommand` only when `CRX_TRUST_REPO_CODEX_COMMAND=1` is set.
- Sends prompts over stdin using `codex exec -`.
- Has a 30-minute timeout for reviews and 2-minute timeout for auth checks.
- Review prompt asks for strict JSON with severity, file, line, impact, and fix instructions.

### Parsing and output

- Recovers JSON from raw output, fenced JSON, embedded arrays, or embedded objects.
- Validates findings defensively and defaults unknown severities to `info`.
- Plain output groups findings by severity and includes impact/fix text.
- JSONL output supports these event types:
  - `review_context`
  - `status`
  - `finding`
  - `autofix`
  - `complete`
  - `error`
- Exit code contract currently implemented:
  - `0` when no blocking findings, or when auto-fix applied.
  - `1` on review/command failure.
  - `3` when critical/major findings remain and no auto-fix was applied.

### Secret and config-file safety

- Redacts likely private keys, dotenv secret assignments, common OpenAI/GitHub/Slack/AWS token forms.
- Runs child processes without shell interpolation.
- Rejects extra instruction files that:
  - are outside the repo lexically,
  - resolve outside the real repo path,
  - are symlinks,
  - are directories/non-files,
  - exceed 50 KB.

### TUI and auto-fix

- `--tui` renders a spinner, boxed title, repo/review context, severity counts, and the plain report.
- Interactive TUI prompts to apply fixes only when at least one critical/major finding exists.
- `--fix` enables non-interactive auto-fix.
- Auto-fix prompt targets critical/major findings first, falls back to all findings if no blocking findings exist.
- Extracts unified diffs from raw or fenced Codex output.
- Applies patches only after `git apply --check` succeeds.

### Tests present

There are focused Node test files for:

- auto-fix prompt/diff extraction/patch application,
- command splitting and Codex command resolution,
- config init/load,
- plain and JSONL formatting,
- Git diff arg construction,
- root commit and shallow clone diff behavior,
- Codex JSON parsing/recovery,
- secret redaction,
- TUI summary and auto-fix result rendering.

## Verification performed

Commands run locally on 2026-05-18:

```bash
npm test
```

Result: **pass** — 23 tests passed, 0 failed.

```bash
npm run build
```

Result: **pass** — TypeScript build completed with `tsc -p tsconfig.json`.

```bash
node dist/cli.js help
```

Result: **pass** — printed help and exited `0`.

```bash
CRX_CODEX_COMMAND="node /tmp/fake-codex.js" node dist/cli.js review --agent -t uncommitted --max-diff-bytes 1000
```

Result: **pass** — emitted valid JSONL on stdout and exited `0` with a mocked empty findings response.

One negative CLI check also exposed a bug:

```bash
node dist/cli.js --help
node dist/cli.js review --bad-option
```

Result: both exited `1`, but printed uncaught stack traces instead of controlled `crx:` errors. `crx --help` is documented as a usage form but is currently parsed as a review option and fails.

## Gaps and risks

### 1. Async CLI errors bypass the intended top-level handler

`main()` returns `review(args)` without `await`, so errors thrown/rejected inside `review()` before its internal `try` are not caught by the top-level `try/catch`. Examples observed:

- `node dist/cli.js --help`
- `node dist/cli.js review --bad-option`

Both print raw stack traces. This is especially bad for agent use because failures become noisy and less parseable.

### 2. Help handling is inconsistent

Top-level `crx help` works, but `crx --help` currently fails because the default command becomes `review` and `--help` is treated as an unknown review option. The README usage implies `crx` should be friendly as a CLI; this is a rough first-run experience.

### 3. Agent mode is parseable on stdout, but stderr is noisy

A mocked `--agent` run produced JSONL on stdout, but also emitted progress lines to stderr:

```text
crx: Collecting Git diff
crx: Running Codex review
```

This is not fatal if agents parse stdout only, but it weakens the “quiet quality gate” behavior. Decide whether stderr status is part of the contract or suppress it in `--agent` mode.

### 4. Auto-fix exit semantics are too optimistic

The CLI exits `0` whenever an auto-fix patch is applied, even though it has not rerun the review or checked whether blocking findings are actually resolved. As a quality gate, “patch applied” is not equivalent to “gate passed.”

Recommended gate semantics: after applying a fix, return a distinct code or require/rerun review before success. At minimum, the `complete` event should make `needsRerun: true` explicit.

### 5. Auto-fix mutates the worktree without dirty-state guardrails

`--fix` can apply a patch into an already dirty worktree. It uses `git apply --check`, which protects patch validity, but not user intent or unrelated pending changes. For agent loops, this increases the chance of mixing review fixes with unrelated edits.

Useful guardrails:

- include pre/post worktree status events,
- require clean index or document that dirty worktrees are allowed,
- emit changed file list after patch application,
- consider `git apply --index` or a dry-run mode depending on workflow.

### 6. Diff coverage has important blind spots

`git diff HEAD` does not include untracked files. That means a newly created but untracked file can be invisible to `crx`. This is a major issue for an after-change-set quality gate unless the agent always stages files first.

Also, `all` and `uncommitted` are effectively the same when `HEAD` exists. If that is intentional, docs should say so; if not, clarify whether `all` means staged + unstaged + untracked or branch diff.

### 7. Base branch behavior is brittle in fresh/local repos

`--base main` uses `main...HEAD`, which fails if the merge base is missing or the branch is not fetched. There is no friendly remediation message. This is common in shallow clones and agent sandboxes.

### 8. JSON schema is informal

The parser is defensive, but there is no exported schema/version for agent events. For a reliable agent quality gate, consumers need a stable contract, version, and examples for every event type and exit code.

### 9. No end-to-end CLI test harness

Tests cover core modules, but not full CLI process behavior, stdout/stderr split, exit codes, invalid arguments, mocked Codex review, mocked blocking findings, or auto-fix with a mocked Codex patch.

This is the biggest confidence gap because the intended product is a CLI invoked by agents.

### 10. Docs are partly stale after auto-fix work

`docs/architecture.md` still says: “The CLI does not apply patches or mutate reviewed code.” That is no longer true after `--fix` and interactive auto-fix. It also lists exit code `2` for unsupported interactive mode, but interactive mode is now implemented and no code path appears to return `2`.

### 11. TUI is a presentational wrapper, not a full interactive workflow

The TUI is useful but minimal. It does not support navigation, collapsing groups, selecting individual findings, previewing patches, or confirming the exact patch before application. That is fine for now, but it should be described as “lightweight TUI summary,” not a rich review UI.

### 12. Live Codex behavior is not covered by tests

The Codex dependency is intentionally external, but there is no fixture for malformed output, timeout behavior, auth failure wording, or model returning a patch that partially applies. Mocking `CRX_CODEX_COMMAND` is enough to build these tests without live Codex.

## Production-readiness score

**5.5 / 10**

Why not lower:

- The core architecture is simple and mostly safe.
- Risky surfaces have some focused tests.
- Secret redaction and config-file boundaries are considered.
- JSONL output and exit codes already make basic agent usage possible.
- Auto-fix validates patches before applying them.

Why not higher:

- CLI process behavior is under-tested and already has visible stack-trace bugs.
- `--fix` can report success without proving the gate is clean.
- Untracked files are invisible.
- Docs and implemented behavior have drifted.
- Agent-mode contract needs to be stricter before depending on it after every change set.

## Recommended first development slice

Goal: make `crx --agent` safe and dependable as an agent-run quality gate after each change set, before improving review intelligence or TUI polish.

### Slice: “Agent gate hardening v0.2”

Implement the smallest set of changes that lets an agent run `crx --agent` after edits and make a deterministic pass/fail decision.

#### Scope

1. **Fix CLI error handling and help**
   - Await `review(args)` inside `main()` or otherwise catch rejected promises.
   - Make `crx --help`, `crx review --help`, and invalid options return controlled output without stack traces.
   - Add tests for invalid args and help exit codes.

2. **Define and test the JSONL contract**
   - Add `docs/agent-contract.md` with event schema, examples, stdout/stderr expectations, and exit codes.
   - Add a `schemaVersion` or `protocolVersion` to `review_context` or all events.
   - Ensure `--agent` stdout is JSONL only.

3. **Add E2E CLI tests with mocked Codex**
   - Mock zero findings => exit `0`.
   - Mock major finding => exit `3` and finding event present.
   - Mock invalid JSON => exit `1` and error event present.
   - Mock `--fix` patch applied => autofix event present and explicit rerun-needed state.
   - Invalid option => exit `1`, no raw stack trace.

4. **Handle untracked files explicitly**
   - Either include untracked files in review input or emit a warning/event listing untracked files skipped.
   - For a quality gate, prefer including untracked text files up to a safe size limit.

5. **Clarify auto-fix gate semantics**
   - Do not treat “patch applied” as a clean pass.
   - Emit `needsRerun: true` after any applied patch.
   - Consider returning a distinct exit code after auto-fix, or keep `0` only if no blocking findings were present before fixing.

6. **Update stale docs**
   - Refresh `docs/architecture.md` to mention auto-fix mutation behavior and current exit codes.
   - Align README/help around TUI and `--fix` safety expectations.

#### Acceptance checks

- `npm test` passes.
- `npm run build` passes.
- New E2E tests verify stdout/stderr and exit codes.
- `crx --help` exits `0`.
- `crx review --bad-option` exits `1` without stack trace.
- `CRX_CODEX_COMMAND=<mock> crx review --agent` emits JSONL-only stdout.
- A mocked blocking finding reliably causes a non-zero gate result.
- If auto-fix applies a patch, output clearly tells the agent to rerun before considering the gate passed.

#### Why this slice first

It improves the actual usage loop without needing better AI prompts or a richer UI. Once agents can trust invocation, parsing, and exit semantics, later work can improve finding quality, context collection, patch preview, or GitHub integration on a solid foundation.

## 2026-05-18 update — Agent gate hardening v0.2

Implemented from the recommended first slice:

- Controlled async CLI errors and clean help handling for `crx --help` / `crx review --help`.
- Versioned agent JSONL protocol (`protocolVersion: 0.2`, `schemaVersion: crx.agent.v0.2`) documented in `docs/agent-contract.md`.
- E2E CLI harness with mocked Codex for success, blocking findings, invalid JSON, invalid args, and auto-fix.
- Agent mode now keeps normal progress off stderr and emits parseable JSONL on stdout.
- Small untracked text files are included in `all`/`uncommitted` review input; skipped untracked paths are reported.
- Auto-fix patch application exits `4` with `needsRerun: true` rather than implying the quality gate passed.
- Architecture/README docs updated for current mutation and exit-code behavior.

Validation: `npm test` and `npm run build` pass.

Remaining highest-impact P0 gap: Slice 2 review scope and instructions — path filters, glob-scoped path instructions, and auto-detected local guideline files.

## Update: Agent gate hardening v0.2 (2026-05-18 14:25 BST)

Implemented since the initial audit:

- Top-level async CLI failures are now awaited by `main()`, so invalid options and rejected review setup errors produce controlled `crx:` messages instead of stack traces.
- `crx --help` and `crx review --help` exit `0` and print usage.
- `--agent` stdout is covered by E2E tests and remains JSONL-only; normal progress is quiet on stderr in agent mode.
- Agent events carry `protocolVersion: "0.2"` and `schemaVersion: "crx.agent.v0.2"`.
- `docs/agent-contract.md` defines event shapes, stdout/stderr expectations, exit codes, and the recommended loop.
- Untracked small text files are included for `all` and `uncommitted` reviews; skipped untracked paths are reported in context/warning events.
- Auto-fix no longer reports a clean gate after applying a patch. Applied fixes emit `needsRerun: true` and exit `4`.
- E2E CLI tests now cover help, invalid options, zero findings, blocking findings, invalid Codex JSON, auto-fix rerun semantics, and untracked-file context.

Current production-readiness score: **6.8 / 10**.

Remaining high-impact gaps:

1. Path filters and path-specific instructions are still missing, so review scope can be noisy on generated/dependency files.
2. Agent contract examples are documented but there is not yet a machine-readable JSON Schema fixture.
3. Base branch errors still need friendlier remediation for shallow/fresh clones.
4. Auto-fix applies patches safely, but does not report changed files or pre/post worktree status.
5. There is no packaged GitHub Actions quality-gate recipe yet.

## 2026-05-18 update — Review scope and instructions v0.3

Implemented from Slice 2:

- Default path filtering for dependency/build/generated/lock/media artifacts before prompt construction.
- Configurable `pathFilters` and glob-scoped `pathInstructions`.
- Auto-detected guideline files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md`) with safe instruction-file validation.
- Agent context now reports `excludedFiles` and `instructionFiles`; path-filter skips emit warning events.
- Added scope unit tests and E2E prompt-capture coverage.

Validation: `npm test` and `npm run build` pass.

Remaining high-impact gaps: base-branch remediation in shallow/fresh clones, CI examples, and richer auto-fix worktree status reporting.

## Update: Review scope and instructions v0.1 (2026-05-18 14:29 BST)

Implemented since the previous loop:

- Added default path filters for dependency, build, coverage, lock, minified, sourcemap, archive, and common binary/media outputs.
- Added repo config fields for `pathFilters`, `pathInstructions`, and `codeGuidelines.filePatterns`.
- Applied path filtering before prompt construction and report excluded files in `review_context.excludedFiles` plus warning events.
- Added glob-scoped path instructions to the review prompt when changed files match configured patterns.
- Auto-detected common guideline files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and `.github/copilot-instructions.md`, while reusing the existing safe instruction-file validation.
- Added unit tests for glob matching, diff block filtering, file extraction, and path-instruction rendering.
- Added an E2E mocked Codex test proving filters, guideline files, and path instructions shape the captured review prompt.

Current production-readiness score: **7.2 / 10**.

Remaining high-impact gaps:

1. Add a packaged GitHub Actions/generic CI recipe so agents can run the gate consistently after each change set.
2. Add a machine-readable JSON Schema fixture for agent events.
3. Add friendlier base-branch/shallow-clone remediation.
4. Add optional local tool command integration for linters/tests/security scanners.
5. Report auto-fix changed files and pre/post worktree status.


## Update: CI gate packaging v0.1 (2026-05-18 14:32 BST)

Implemented since the previous loop:

- Added `docs/ci-quality-gate.md` with generic shell and GitHub Actions examples for `crx review --agent`.
- Added `docs/schema/agent-event.schema.json` as a machine-readable JSON Schema for the JSONL event contract.
- Added `scripts/crx-quality-gate.sh` as a reusable exit-code wrapper.
- Added tests that parse the schema and syntax-check the shell wrapper.

Current production-readiness score: **7.5 / 10**.

Remaining high-impact gaps:

1. Optional local tool integration for lint/test/security signals.
2. Friendlier base-branch/shallow-clone remediation.
3. Auto-fix changed-file and worktree-status reporting.
4. JSON Schema is documented and parse-tested, but not runtime-validated by the CLI.

## 2026-05-18 update — Auto-fix worktree observability v0.4

Implemented:

- Auto-fix now emits `worktree_status` events before and after patch attempts, including raw porcelain status entries and a dirty boolean.
- Auto-fix events now include `changedFiles` derived from the generated patch.
- E2E tests verify worktree status events and changed-file reporting.

Validation: `npm test` and `npm run build` pass.

Remaining high-impact gaps: base-branch/shallow-clone remediation and CI examples for agent quality-gate use.

## 2026-05-18 update — Base diff remediation v0.5

Implemented:

- Failed `--base` / `--base-commit` diffs now produce a targeted remediation message instead of raw Git failure text alone.
- Messages call out shallow/fresh CI checkouts, unfetched refs, `git fetch origin <base> --depth=50`, and GitHub Actions `fetch-depth: 0`.
- Added regression coverage for missing base remediation.

Validation: `npm test` and `npm run build` pass.

Remaining high-impact gaps: stricter config validation, optional tool/lint signal enrichment, and continued docs/schema polish.

## 2026-05-18 update — Local tool quality signals v0.6

Implemented:

- Added optional `localTools` config for project-native lint/test/security commands.
- Local tools run without shell interpolation, emit `tool_result` JSONL events, and can be marked non-blocking.
- Blocking local tool failures now fail the agent gate with exit `3` even when Codex returns no findings.
- Local tool output is included in the Codex review prompt as deterministic context.
- Extended JSON Schema coverage for `tool_result`, `worktree_status`, and auto-fix `changedFiles`.

Validation: `npm test` and `npm run build` pass.

Remaining high-impact gaps: runtime JSON Schema validation, richer CI examples for local tools, review profile/noise controls, and hosted/team features explicitly deferred.

## 2026-05-18 update — Local tool signal + config validation v0.6

Implemented:

- Added opt-in local tool command integration via `localTools` in `crx.config.json`.
- Each tool emits a `tool_result` JSONL event and contributes output to the Codex review prompt.
- Blocking local tool failures now fail the quality gate with exit `3`; non-blocking tools are advisory.
- Config loading now reports invalid JSON explicitly and sanitizes supported config fields, including local tool definitions.

Validation: `npm test` and `npm run build` pass.

Remaining high-impact gaps: runtime JSON Schema validation, broader config docs/examples, and continued production fixture hardening.


## Update: Local tool-result integration v0.1 (2026-05-18 14:42 BST)

Implemented since the previous loop:

- Added typed `localTools` config entries for project-native commands.
- Runs enabled local tools before Codex review without shell interpolation.
- Emits `tool_result` JSONL events with command argv, exit code, pass/blocking status, timeout flag, duration, and bounded stdout/stderr.
- Includes local tool output in the Codex prompt so model findings can account for deterministic lint/test/security signals.
- Blocking non-zero local tool exits fail the gate with exit `3` even when Codex returns zero findings.
- Sanitizes config values and reports invalid JSON as controlled config errors.

Current production-readiness score: **7.9 / 10**.

Remaining high-impact gaps:

1. Runtime validation against `docs/schema/agent-event.schema.json`.
2. Better preconfigured presets for common npm/Python/Ruby/security tools.
3. Better base-branch/shallow-clone remediation in docs and maybe CLI hints.
4. Optional second-pass automation command around fix/rerun loop.

## Update: Agent contract runtime validation v0.1 (2026-05-18 14:50 BST)

Implemented since the previous loop:

- Added a runtime `validateAgentEvent` guard for every documented JSONL event type.
- `formatJsonl` now validates versioned events before serializing, preventing malformed agent events from being printed silently.
- Added contract tests covering `status`, `review_context`, `warning`, `tool_result`, `finding`, `worktree_status`, `autofix`, `complete`, and `error` events.

Current production-readiness score: **8.1 / 10**.

Remaining high-impact gaps:

1. A first-class second-pass fix/rerun helper.
2. Tool presets for common ecosystems.
3. Richer docs/examples for shallow clone remediation.
4. Runtime validation is TypeScript-native rather than generated from JSON Schema.


## Update: Second-pass agent-loop helper v0.1 (2026-05-18 15:00 BST)

Implemented since the previous loop:

- Added `scripts/crx-agent-loop.sh` for bounded review/fix/rerun automation.
- The helper supports `CRX_FIX=1`, `CRX_MAX_PASSES`, `CRX_REVIEW_TYPE`, `CRX_BASE`, `CRX_BASE_COMMIT`, and JSONL output naming.
- It treats exit `4` as “rerun required,” never as success, and only exits `0` after a clean rerun/pass.
- Added syntax coverage in tests and docs in the CI quality-gate guide.

Current production-readiness score: **8.3 / 10**.

Remaining high-impact gaps:

1. Tool presets for common ecosystems.
2. Better parsing/summary helpers for JSONL artifacts.
3. Runtime validator is hand-written rather than generated from the schema.
4. No hosted PR/comment workflow, intentionally deferred.


## Update: JSONL artifact summary helper v0.1 (2026-05-18 15:10 BST)

Implemented since the previous loop:

- Added `scripts/crx-jsonl-summary.mjs` for compact CI summaries of agent JSONL artifacts.
- The helper summarizes finding counts, severities, blocking findings, blocking tool failures, complete summaries, and errors.
- It preserves gate semantics with exit `0`, `1`, `3`, and `4` based on artifact contents.
- Added test coverage using an in-memory JSONL fixture.

Current production-readiness score: **8.4 / 10**.

Remaining high-impact gaps:

1. Preset generation for common local tool configs.
2. Better packaged examples for npm/Python/Ruby repositories.
3. Optional support for compatible `.coderabbit.yaml` subset import.

## 2026-05-18 update — Node local-tool config preset v0.9

Implemented:

- Added `crx config init --preset node` as a quick-start for Node CI gates.
- The preset configures blocking `npm test` and `npm run build` local tools.
- README and CI docs now show the preset path alongside hand-written `localTools` config.

Validation: `npm test` and `npm run build` pass.

Remaining high-impact gaps: further docs/schema consistency checks, optional additional presets, and richer review categories.


## Update: Python and Ruby local-tool presets v0.1 (2026-05-18 15:30 BST)

Implemented since the previous loop:

- Extended `crx config init --preset ...` beyond Node to include `python` and `ruby`.
- Python preset adds blocking `python -m pytest` and advisory `python -m ruff check .`.
- Ruby preset adds blocking `bundle exec rspec` and advisory `bundle exec rubocop`.
- Updated tests and docs to cover all three presets.

Current production-readiness score: **8.6 / 10**.

Remaining high-impact gaps:

1. Optional `.coderabbit.yaml` subset import/mapping.
2. SARIF/JUnit artifact adapters.
3. More nuanced per-tool severity mapping.

## 2026-05-18 update — Finding categories v1.0

Implemented:

- Added CodeRabbit-style finding categories: `potential_issue`, `refactor_suggestion`, and `nitpick`.
- Prompt, parser, JSON Schema, runtime event validation, README, and agent contract now describe the category field.
- Missing categories are defaulted deterministically for backward compatibility.

Validation: `npm test` and `npm run build` pass.

Remaining high-impact gaps: optional `.coderabbit.yaml` subset mapping/import docs, artifact adapters, and deeper per-tool severity mapping.
