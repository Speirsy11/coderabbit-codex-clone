# Git hook recipes

`crx` is designed for CI first, but the same gate can run locally before a push. Keep hooks lightweight and recoverable: developers should be able to bypass a hook with Git's normal `--no-verify` escape hatch when they need to push WIP intentionally.

## Pre-push gate

Create `.git/hooks/pre-push` in a repository that already has `crx` on `PATH`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Review the commits that are about to be pushed. The helper emits:
# - crx-config.json
# - crx-review.jsonl
# - crx-review.txt
# - crx-review.sarif
# - crx-review.junit.xml
CRX_REVIEW_TYPE=committed scripts/crx-quality-gate.sh
```

Make it executable:

```bash
chmod +x .git/hooks/pre-push
```

## Fast advisory hook

For a less blocking local hook, keep deterministic project checks in `localTools` but mark noisy checks as advisory:

```json
{
  "reviewProfile": "chill",
  "localTools": [
    { "name": "test", "command": ["npm", "test"], "timeoutMs": 300000 },
    { "name": "audit", "command": "npm audit --audit-level high", "blocking": false, "failureSeverity": "minor" }
  ]
}
```

Blocking tool failures and critical/major findings still stop the push. Advisory failures remain visible in JSONL and summaries.

## Auto-fix workflow

Do not run `--fix` from an unattended hook. Instead, run fixes manually and verify them before pushing:

```bash
crx review --agent --fix --verify-fix --type uncommitted > crx-fix.jsonl
crx summarize crx-fix.jsonl
# If exit 4 applied a patch, inspect it, then rerun without --fix:
crx review --agent --type uncommitted > crx-rerun.jsonl
```

This keeps the hook deterministic while still supporting the CodeRabbit-style fix → verify → rerun loop locally.
