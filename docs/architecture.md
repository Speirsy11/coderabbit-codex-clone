# Architecture

`crx` is a small Node.js and TypeScript CLI with clear module boundaries.

## Data Flow

1. `src/cli.ts` parses commands and options.
2. `src/git.ts` verifies the selected directory is a Git repo and collects a diff with safe `spawn` arguments, then applies configured path filters. `src/scope.ts` filters generated/dependency paths and computes path-specific instruction context.
3. `src/redact.ts` removes likely secrets from the diff.
4. `src/config.ts` loads `crx.config.json`, review preferences, path filters, path instructions, and guideline patterns.
5. `src/prompt.ts` builds a strict JSON-only review prompt.
6. `src/codex.ts` invokes `codex exec -` through the trusted Codex command and sends the review prompt over stdin.
7. `src/parser.ts` extracts and validates findings from Codex output.
8. `src/format.ts` renders human plain text or versioned JSONL agent events.
9. Optional auto-fix records pre/post worktree status, asks Codex for a unified diff, applies it only after `git apply --check` succeeds, and reports changed files.

## Security Notes

- No CodeRabbit APIs are used.
- No OpenAI API key is required by this tool.
- Commands use `spawn(..., { shell: false })`.
- Repo-local `codexCommand` is not trusted by default; use `CRX_CODEX_COMMAND` or opt in with `CRX_TRUST_REPO_CODEX_COMMAND=1`.
- Extra and auto-detected instruction files must resolve inside the repository, must be regular files, and symlinks are rejected.
- Diffs are path-filtered and redacted before prompt construction.
- Review prompts are passed via stdin rather than process arguments.
- Normal review mode is read-only. `--fix` and interactive auto-fix can mutate the worktree, but only after a generated unified diff passes `git apply --check`.

## Exit Codes

- `0`: review ran and found no critical or major findings.
- `1`: command or review failure.
- `3`: review ran and returned critical or major findings.
- `4`: auto-fix applied a patch; rerun is required before the gate can pass.

See [Agent JSONL Contract](./agent-contract.md) for event schemas and agent-loop semantics.
