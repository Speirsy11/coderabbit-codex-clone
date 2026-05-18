#!/usr/bin/env bash
set -uo pipefail

review_type="${CRX_REVIEW_TYPE:-committed}"
out="${CRX_REVIEW_OUT:-crx-review.jsonl}"
config_out="${CRX_CONFIG_OUT:-crx-config.json}"
summary_out="${CRX_SUMMARY_OUT:-crx-review.txt}"
sarif_out="${CRX_SARIF_OUT:-crx-review.sarif}"
junit_out="${CRX_JUNIT_OUT:-crx-review.junit.xml}"
metrics_out="${CRX_METRICS_OUT:-crx-review.metrics.json}"

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

artifact_code=0
if [ "${CRX_SKIP_ARTIFACTS:-0}" != "1" ] && [ -s "$out" ]; then
  set +e
  crx summarize "$out" > "$summary_out"
  summary_code=$?
  crx summarize --format sarif "$out" > "$sarif_out"
  sarif_code=$?
  crx summarize --format junit "$out" > "$junit_out"
  junit_code=$?
  crx summarize --format json "$out" > "$metrics_out"
  metrics_code=$?
  set -e
  for summarize_code in "$summary_code" "$sarif_code" "$junit_code" "$metrics_code"; do
    case "$summarize_code" in
      0|3|4)
        ;;
      *)
        artifact_code=1
        ;;
    esac
  done
fi

if [ "$artifact_code" -ne 0 ]; then
  if [ "$code" -eq 0 ]; then
    echo "crx gate artifact generation failed" >&2
    exit 1
  fi
  echo "crx gate artifact generation failed; preserving review exit $code" >&2
fi

case "$code" in
  0)
    echo "crx gate passed. See $out"
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
