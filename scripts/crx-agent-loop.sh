#!/usr/bin/env bash
set -uo pipefail

review_type="${CRX_REVIEW_TYPE:-committed}"
out="${CRX_REVIEW_OUT:-crx-review.jsonl}"
max_passes="${CRX_MAX_PASSES:-2}"
fix="${CRX_FIX:-0}"
base_args=(review --agent --type "$review_type")

if [ -n "${CRX_BASE:-}" ]; then
  base_args+=(--base "$CRX_BASE")
fi
if [ -n "${CRX_BASE_COMMIT:-}" ]; then
  base_args+=(--base-commit "$CRX_BASE_COMMIT")
fi

run_review() {
  local outfile="$1"
  shift
  set +e
  crx "${base_args[@]}" "$@" > "$outfile"
  local code=$?
  set -e
  return "$code"
}

if ! [[ "$max_passes" =~ ^[1-9][0-9]*$ ]]; then
  echo "CRX_MAX_PASSES must be a positive integer" >&2
  exit 1
fi

pass=1
if [ "$fix" = "1" ]; then
  run_review "$out" --fix
else
  run_review "$out"
fi
code=$?

while [ "$code" -eq 4 ] && [ "$pass" -lt "$max_passes" ]; do
  pass=$((pass + 1))
  rerun_out="${out%.jsonl}.pass-${pass}.jsonl"
  echo "crx applied fixes; rerunning pass $pass without --fix -> $rerun_out" >&2
  run_review "$rerun_out"
  code=$?
  out="$rerun_out"
done

case "$code" in
  0)
    echo "crx agent loop passed after $pass pass(es). Final output: $out"
    ;;
  3)
    echo "crx agent loop failed with blocking findings/tool failures after $pass pass(es). Final output: $out" >&2
    exit 3
    ;;
  4)
    echo "crx agent loop stopped after $pass pass(es) because fixes still require rerun. Final output: $out" >&2
    exit 4
    ;;
  *)
    echo "crx agent loop failed with exit $code after $pass pass(es). Final output: $out" >&2
    tail -n 20 "$out" >&2 || true
    exit "$code"
    ;;
esac
