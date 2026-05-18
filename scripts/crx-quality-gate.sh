#!/usr/bin/env bash
set -uo pipefail

review_type="${CRX_REVIEW_TYPE:-committed}"
out="${CRX_REVIEW_OUT:-crx-review.jsonl}"
config_out="${CRX_CONFIG_OUT:-crx-config.json}"

if [ "${CRX_SKIP_CONFIG_VALIDATE:-0}" != "1" ]; then
  if ! crx config validate --json > "$config_out"; then
    echo "crx config validation failed. See $config_out" >&2
    exit 1
  fi
fi

set +e
crx review --agent --type "$review_type" > "$out"
code=$?
set -e

case "$code" in
  0)
    echo "crx gate passed"
    ;;
  3)
    echo "crx gate failed: blocking findings remain. See $out" >&2
    exit 3
    ;;
  4)
    echo "crx applied an auto-fix; rerun review before passing. See $out" >&2
    exit 4
    ;;
  *)
    echo "crx review failed with exit $code. See $out" >&2
    tail -n 20 "$out" >&2 || true
    exit "$code"
    ;;
esac
