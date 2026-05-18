# CI Quality Gate

`crx review --agent` can run as a non-interactive quality gate after each coherent change set.

## Exit-code policy

- `0`: pass; no critical/major findings in this run.
- `1`: tool or review failure; inspect the final JSONL `error` event.
- `3`: fail; critical/major findings remain.
- `4`: auto-fix applied; rerun before deciding pass/fail.

CI should parse stdout as JSONL only and archive it as an artifact. Stderr is intentionally quiet in normal agent mode. Optional `localTools` entries in `crx.config.json` can run project-native checks before Codex review; blocking non-zero exits emit `tool_result` events and fail the gate with exit `3`.

## Generic shell

```bash
set +e
crx review --agent --type committed > crx-review.jsonl
code=$?
set -e

case "$code" in
  0) echo "crx gate passed" ;;
  3) echo "crx gate failed: blocking findings" >&2; exit 3 ;;
  4) echo "crx applied fixes; rerun review before passing" >&2; exit 4 ;;
  *) echo "crx review failed" >&2; tail -n 20 crx-review.jsonl >&2; exit "$code" ;;
esac
```

## GitHub Actions example

Use a runner where the Codex CLI is already authenticated, or provide a trusted `CRX_CODEX_COMMAND` wrapper for your environment.

```yaml
name: crx quality gate

on:
  pull_request:
  push:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - name: Run crx review
        run: |
          set +e
          node dist/cli.js review --agent --type committed > crx-review.jsonl
          code=$?
          set -e
          cat crx-review.jsonl
          if [ "$code" -eq 0 ]; then exit 0; fi
          if [ "$code" -eq 3 ]; then echo "Blocking crx findings" >&2; exit 3; fi
          if [ "$code" -eq 4 ]; then echo "Auto-fix applied; rerun required" >&2; exit 4; fi
          echo "crx failed" >&2
          exit "$code"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: crx-review
          path: crx-review.jsonl
```

## Schema

A machine-readable event schema is available at [`schema/agent-event.schema.json`](./schema/agent-event.schema.json). Consumers should still ignore unknown fields so the contract can evolve without breaking older agents.


## Local tool checks

Example `crx.config.json` snippet:

```json
{
  "reviewProfile": "chill",
  "localTools": [
    { "name": "test", "command": ["npm", "test"], "timeoutMs": 300000 },
    { "name": "audit", "command": "npm audit --audit-level high", "blocking": false }
  ]
}
```

Commands are split and spawned without a shell. Use array form for exact argv control. Tool output is truncated before being included in JSONL and the Codex prompt. Use `reviewProfile: "chill"` for production-risk gates and `"assertive"` when you want broader maintainability feedback.
