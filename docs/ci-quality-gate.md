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
crx config validate --json > crx-config.json

set +e
crx review --agent --type committed > crx-review.jsonl
code=$?
crx summarize crx-review.jsonl > crx-review.txt
crx summarize --format sarif crx-review.jsonl > crx-review.sarif
crx summarize --format junit crx-review.jsonl > crx-review.junit.xml
crx summarize --format json crx-review.jsonl > crx-review.metrics.json
set -e

case "$code" in
  0) echo "crx gate passed" ;;
  3) echo "crx gate failed: blocking findings" >&2; exit 3 ;;
  4) echo "crx applied fixes; rerun review before passing" >&2; exit 4 ;;
  *) echo "crx review failed" >&2; tail -n 20 crx-review.jsonl >&2; exit "$code" ;;
esac
```

The reusable `scripts/crx-quality-gate.sh` helper performs the same preflight and writes `crx-config.json`, `crx-review.jsonl`, `crx-review.txt`, `crx-review.sarif`, `crx-review.junit.xml`, and `crx-review.metrics.json` by default. Set `CRX_SKIP_ARTIFACTS=1` only when another CI step handles summaries.

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
          node dist/cli.js config validate --json > crx-config.json
          set +e
          node dist/cli.js review --agent --type committed > crx-review.jsonl
          code=$?
          node dist/cli.js summarize crx-review.jsonl > crx-review.txt
          node dist/cli.js summarize --format sarif crx-review.jsonl > crx-review.sarif
          node dist/cli.js summarize --format junit crx-review.jsonl > crx-review.junit.xml
          node dist/cli.js summarize --format json crx-review.jsonl > crx-review.metrics.json
          set -e
          cat crx-review.txt
          if [ "$code" -eq 0 ]; then exit 0; fi
          if [ "$code" -eq 3 ]; then echo "Blocking crx findings" >&2; exit 3; fi
          if [ "$code" -eq 4 ]; then echo "Auto-fix applied; rerun required" >&2; exit 4; fi
          echo "crx failed" >&2
          exit "$code"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: crx-review
          path: |
            crx-config.json
            crx-review.jsonl
            crx-review.txt
            crx-review.sarif
            crx-review.junit.xml
            crx-review.metrics.json
```

## Config preflight

Add a quick config check before expensive reviews when bootstrapping CI:

```bash
crx config validate --json --dir .
```

The command exits non-zero for invalid native config JSON and prints the effective sanitized config plus source (`crx.config.json`, `.coderabbit.yaml`, `.coderabbit.yml`, or defaults).

## Schema

A machine-readable event schema is available at [`schema/agent-event.schema.json`](./schema/agent-event.schema.json). Consumers should still ignore unknown fields so the contract can evolve without breaking older agents.


## Local tool checks

Example `crx.config.json` snippet:

```json
{
  "reviewProfile": "chill",
  "localTools": [
    { "name": "test", "command": ["npm", "test"], "timeoutMs": 300000 },
    { "name": "audit", "command": "npm audit --audit-level high", "blocking": false, "failureSeverity": "minor" }
  ]
}
```

Commands are split and spawned without a shell. Use array form for exact argv control. Tool output is truncated before being included in JSONL and the Codex prompt. Failed tools default to `major` severity when blocking and `minor` when non-blocking; set `failureSeverity` to override the JSONL/artifact severity. Use `reviewProfile: "chill"` for production-risk gates and `"assertive"` when you want broader maintainability feedback.

### Preset configs

For Node, Python, and Ruby projects, generate a starter config with blocking `npm test`/`npm run build`, `pytest`/`ruff`, or `rspec`/`rubocop` checks:

```bash
crx config init --preset node|python|ruby
```

Edit the generated `localTools` array if your project uses different scripts or package managers.


## Second-pass agent loop

For agents that are allowed to apply local fixes, use `scripts/crx-agent-loop.sh` with a small pass limit. It runs `crx review --agent`, optionally with `--fix`, and reruns automatically when the first pass exits `4` because a patch was applied.

```bash
CRX_FIX=1 CRX_MAX_PASSES=2 CRX_REVIEW_TYPE=committed scripts/crx-agent-loop.sh
```

The helper never treats “fix applied” as success. It only exits `0` after a rerun exits `0`; blocking findings or blocking tool failures still exit `3`.


## JSONL artifact summaries

Use `scripts/crx-jsonl-summary.mjs` to turn a JSONL artifact into a compact CI log summary while preserving the same blocking semantics:

```bash
scripts/crx-jsonl-summary.mjs crx-review.jsonl
```

It exits `3` when the artifact contains critical/major findings or blocking tool failures, `4` when the final `complete` event requires a rerun, `1` for error events or invalid JSONL, and `0` otherwise.

The matching no-build metrics helper is:

```bash
scripts/crx-jsonl-metrics.mjs crx-review.jsonl > crx-review.metrics.json
```

## Metrics JSON

Use metrics JSON when you want a tiny artifact for trend dashboards or later history aggregation:

```bash
crx summarize --format json crx-review.jsonl > crx-review.metrics.json
# or, without the built CLI:
scripts/crx-jsonl-metrics.mjs crx-review.jsonl > crx-review.metrics.json
```

The JSON includes finding counts by severity/category, blocking finding count, local tool failure/timing counts, final completion metadata, error messages, and the same gate-style exit code that `crx summarize` returns.

## SARIF export

Use SARIF when your CI system can display code-scanning annotations:

```bash
crx summarize --format sarif crx-review.jsonl > crx-review.sarif
# or, without the built CLI:
scripts/crx-jsonl-to-sarif.mjs crx-review.jsonl > crx-review.sarif
```

Critical and major findings become SARIF `error` results; minor findings become `warning`; trivial/info findings become `note`.

## JUnit export

For CI systems that already visualize test reports, convert blocking crx results to failing JUnit cases:

```bash
crx summarize --format junit crx-review.jsonl > crx-review.junit.xml
# or, without the built CLI:
scripts/crx-jsonl-to-junit.mjs crx-review.jsonl > crx-review.junit.xml
```

Only blocking findings and blocking local tool failures become failures; a clean artifact emits one passing `crx:pass` testcase.

The `crx summarize` command can also emit compact metrics JSON with `--format json` for history or dashboard artifacts. The `crx summarize` command and standalone artifact scripts preserve gate-style exit codes: `3` for blocking findings/tool failures, `4` when a rerun is required, `1` for error events or invalid JSONL, and `0` otherwise.
