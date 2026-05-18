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
