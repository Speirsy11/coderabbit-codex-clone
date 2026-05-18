# Agent JSONL Contract

`crx review --agent` is the stable interface for agents and CI quality gates.

## Stream contract

- stdout is JSONL only: one valid JSON object per line, no prose.
- stderr is quiet during normal agent reviews. Failures are reported as JSONL `error` events on stdout plus exit code `1`.
- Every event includes:
  - `protocolVersion`: currently `0.2`
  - `schemaVersion`: currently `crx.agent.v0.2`
  - `type`: event discriminator

Consumers should ignore unknown event types and unknown fields for forward compatibility. A machine-readable schema lives at `docs/schema/agent-event.schema.json`.

## Event types

### `status`

Sparse progress marker.

```json
{"type":"status","protocolVersion":"0.2","schemaVersion":"crx.agent.v0.2","message":"Collecting Git diff."}
```

### `review_context`

Review scope and diff metadata.

```json
{
  "type":"review_context",
  "protocolVersion":"0.2",
  "schemaVersion":"crx.agent.v0.2",
  "repoDir":"/repo",
  "reviewType":"uncommitted",
  "diffBytes":1234,
  "truncated":false,
  "configFiles":[],
  "untrackedFiles":["src/new.ts"],
  "skippedUntrackedFiles":[],
  "excludedFiles":["dist/bundle.js"],
  "instructionFiles":["AGENTS.md"]
}
```

For `all` and `uncommitted`, small untracked text files are included in review input. Large, binary, unreadable, and non-file untracked paths are skipped and listed in `skippedUntrackedFiles`. Files matching path filters are excluded before prompt construction and listed in `excludedFiles`. Auto-detected guideline files and explicit `-c/--config` files are listed in `instructionFiles`. Files excluded by path filters are listed in `excludedFiles`. Auto-detected and explicit instruction files are listed in `instructionFiles`.

### `warning`

Non-fatal quality-gate caveat, such as skipped untracked files or files excluded by path filters.

```json
{"type":"warning","protocolVersion":"0.2","schemaVersion":"crx.agent.v0.2","message":"Some untracked files were skipped because they were too large, binary, or unreadable.","files":["large.bin"]}
```

### `finding`

A validated Codex finding. Severity is one of `critical`, `major`, `minor`, `trivial`, or `info`.

```json
{
  "type":"finding",
  "protocolVersion":"0.2",
  "schemaVersion":"crx.agent.v0.2",
  "severity":"major",
  "fileName":"src/app.ts",
  "lineStart":42,
  "title":"Missing null guard",
  "message":"The new call path can pass undefined.",
  "impact":"Runtime crash.",
  "codegenInstructions":"Add an early guard before dereferencing.",
  "suggestions":["Return a fallback value."]
}
```

### `autofix`

Emitted when `--fix` or interactive auto-fix runs.

```json
{"type":"autofix","protocolVersion":"0.2","schemaVersion":"crx.agent.v0.2","applied":true,"summary":"Applied Codex-generated patch.","needsRerun":true,"rerunCommand":"crx review --agent --type all"}
```

If `applied` is true, the gate is not clean yet. Rerun the review before treating the change set as passing.

### `complete`

Terminal success event for a completed review.

```json
{"type":"complete","protocolVersion":"0.2","schemaVersion":"crx.agent.v0.2","findingsCount":0,"summary":"0 finding(s).","autoFixApplied":false,"needsRerun":false}
```

### `error`

Terminal failure event.

```json
{"type":"error","protocolVersion":"0.2","schemaVersion":"crx.agent.v0.2","message":"Codex returned no valid JSON findings array."}
```

## Exit codes

- `0`: review completed and no `critical` or `major` findings remain in this run.
- `1`: command/review failure. In agent mode, inspect the final `error` event.
- `3`: review completed and at least one `critical` or `major` finding remains.
- `4`: auto-fix applied a patch. The worktree changed and the agent must rerun before deciding pass/fail.

## Recommended agent loop

1. Run `crx review --agent` after a coherent change set.
2. Parse stdout JSONL only.
3. If exit `3`, fix only `critical`/`major` findings first.
4. If using `--fix` and exit `4`, inspect/keep the patch if appropriate, then rerun once.
5. Treat `minor`, `trivial`, and `info` as advisory unless they expose real production risk.
