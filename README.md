# coderabbit-codex-clone

`crx` is a local CodeRabbit-style review CLI that uses the user's authenticated Codex CLI subscription. It does not call CodeRabbit APIs and does not require OpenAI API keys.

## Install

```bash
npm install
npm run build
npm link
```

The default AI command is:

```bash
npx -y @openai/codex
```

Override it with `CRX_CODEX_COMMAND`. A repo-local `codexCommand` in `crx.config.json` is only honored when `CRX_TRUST_REPO_CODEX_COMMAND=1` is set, because checked-in command config from untrusted repos can execute arbitrary local programs.

## Usage

```bash
crx
crx review
crx review --agent
crx review --tui
crx review --fix
crx review -t uncommitted
crx review --base main
crx review --base-commit abc123
crx review --profile assertive
crx review --dir /path/to/repo -c AGENTS.md README.md
crx auth status
crx config init --preset node|python|ruby
```

`--plain` is the default. `--agent` emits JSONL-only stdout with one event per line: `review_context`, `status`, `warning`, `tool_result`, `finding`, `worktree_status`, `autofix`, `complete`, and `error`. See `docs/agent-contract.md` for the versioned schema and exit codes. Findings include severity plus an optional category (`potential_issue`, `refactor_suggestion`, or `nitpick`). `--profile chill|assertive` tunes review noise; `chill` is the default and asks for production-relevant issues only. `crx.config.json` supports path filters, glob-scoped path instructions, auto-detected guideline file patterns, review profiles, and opt-in local tool commands for agent reviews. If `crx.config.json` is absent, crx also reads a safe `.coderabbit.yaml` / `.coderabbit.yml` subset for `reviews.profile`, `reviews.path_filters`, `reviews.path_instructions`, and `knowledge_base.code_guidelines.filePatterns`.

`--tui`/`--interactive` opens a lightweight terminal UI with a spinner, severity counts, grouped findings, and an optional prompt to apply Codex-generated fixes for blocking findings.

`--fix` enables auto-fix mode without prompting. After the review, `crx` asks Codex for a minimal unified diff patch for the findings, verifies it with `git apply --check`, and applies it with `git apply` only if the patch is valid. A successful apply exits `4`, reports pre/post `worktree_status`, lists `changedFiles`, and sets `needsRerun: true`; rerun the review before treating the gate as passed. Review the resulting local diff before committing.


## CI Quality Gate

For non-interactive automation, run `crx review --agent` and gate on exit codes. See `docs/ci-quality-gate.md` for a GitHub Actions example, a generic shell recipe, `docs/coderabbit-config-mapping.md` for CodeRabbit config concept mapping, and `docs/schema/agent-event.schema.json` for the JSONL event schema. Reusable helpers are available at `scripts/crx-quality-gate.sh` for one-pass gating, `scripts/crx-agent-loop.sh` for a bounded fix/rerun loop, `scripts/crx-jsonl-summary.mjs` for compact CI summaries, `scripts/crx-jsonl-to-sarif.mjs` for SARIF export, and `scripts/crx-jsonl-to-junit.mjs` for JUnit reports. The built CLI also supports `crx summarize --format text|sarif|junit`.

## Agent Loop

Recommended loop:

1. Implement the change.
2. Run `crx --agent`.
3. Wait quietly. Codex-backed reviews can take several minutes.
4. Fix only `critical` and `major` findings, or run `crx --fix` for a first-pass Codex patch.
5. If `--fix` exits `4`, review the local diff and rerun once.
6. After the second pass, ignore nits unless they expose real production risk.

## What it looks like

Given a tiny bug like this:

```ts
export function label(user?: { name: string }) {
  return user.name.toUpperCase();
}
```

Run the TUI:

```bash
crx --tui -t uncommitted
```

Example output:

```text
╭──────────────────────────────╮
│ crx Codex review             │
╰──────────────────────────────╯
Repo: /Users/alex/demo
Review: uncommitted • diff 182 bytes
Findings: 1  critical 0 • major 1 • minor 0 • trivial 0 • info 0

CRX review complete: 1 finding.
Diff size: 182 bytes.

MAJOR
- src/label.ts:2 Missing null guard
  `user` can be undefined, so `user.name` can throw before callers see a useful fallback.
  Impact: Optional callers can crash at runtime.
  Fix: Return a fallback label when user is undefined before reading `user.name`.

Apply Codex auto-fix for critical/major findings? [y/N] y
✓ Auto-fix: Applied Codex-generated patch.
```

The command exits `4` because a patch was applied and review must be rerun. The local diff now looks like:

```diff
 export function label(user?: { name: string }) {
+  if (!user) return "UNKNOWN";
   return user.name.toUpperCase();
 }
```

Non-interactive version:

```bash
crx --fix -t uncommitted
```

## Safety

`crx` redacts likely secrets from diffs before sending them to Codex, including common API tokens, dotenv secret assignments, and private keys. Git and Codex commands are run with argument arrays, not shell string concatenation. Review prompts are sent to Codex over stdin rather than process argv. Extra instruction files must stay inside the repo and symlinks are rejected. Auto-fix mode applies only patches that pass `git apply --check`, but you should still inspect the resulting diff before committing.

`crx config init --preset node|python|ruby` writes a starter config that runs `npm test`/`npm run build`, `pytest`/`ruff`, or `rspec`/`rubocop` as blocking local tools. Configure optional local project checks with `localTools` in `crx.config.json`; each command runs without shell interpolation, emits a `tool_result` event, is included in the Codex prompt, and blocks the gate by default unless `blocking: false` is set.

For `all` and `uncommitted` reviews, small untracked text files are included in the review input. Large, binary, unreadable, and non-file untracked paths are skipped and reported in JSONL context/warning events. Default path filters exclude generated/dependency/media artifacts such as `node_modules/**`, `dist/**`, lockfiles, minified bundles, source maps, and common binary extensions; add repo-specific filters with `pathFilters` in `crx.config.json`. `pathInstructions` can attach glob-scoped guidance to matching changed files, and common guideline files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and `.github/copilot-instructions.md` are auto-loaded when present. If the diff exceeds `--max-diff-bytes`, it is truncated and the truncation is reported in plain and JSONL output.

## Limitations

- The review quality depends on the locally authenticated Codex CLI.
- Large diffs are truncated by default.
- JSON recovery is defensive, but invalid Codex output can still fail the review.
- Auto-fix quality depends on Codex producing a valid minimal unified diff.
