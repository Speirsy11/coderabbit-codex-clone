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

Override it with `CRX_CODEX_COMMAND` or `codexCommand` in `crx.config.json`.

## Usage

```bash
crx
crx review
crx review --agent
crx review -t uncommitted
crx review --base main
crx review --base-commit abc123
crx review --dir /path/to/repo -c AGENTS.md README.md
crx auth status
crx config init
```

`--plain` is the default. `--agent` emits JSONL with one event per line: `review_context`, `status`, `finding`, `complete`, and `error`.

`--interactive` is an MVP placeholder and exits non-zero.

## Agent Loop

Recommended loop:

1. Implement the change.
2. Run `crx --agent`.
3. Wait quietly. Codex-backed reviews can take several minutes.
4. Fix only `critical` and `major` findings.
5. Rerun once.
6. After the second pass, ignore nits unless they expose real production risk.

## Safety

`crx` redacts likely secrets from diffs before sending them to Codex, including common API tokens, dotenv secret assignments, and private keys. Git and Codex commands are run with argument arrays, not shell string concatenation. The MVP never auto-applies code changes.

If the diff exceeds `--max-diff-bytes`, it is truncated and the truncation is reported in plain and JSONL output.

## Limitations

- The review quality depends on the locally authenticated Codex CLI.
- Large diffs are truncated by default.
- JSON recovery is defensive, but invalid Codex output can still fail the review.
- No TUI and no auto-fix mode in the MVP.
