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
