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
