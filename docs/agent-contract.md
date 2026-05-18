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
  "configSource":"crx.config.json",
  "changedFiles":["src/app.ts","src/new.ts"],
  "changedFileStats":[{"fileName":"src/app.ts","status":"modified","additions":2,"deletions":1},{"fileName":"src/new.ts","status":"added","additions":8,"deletions":0}],
  "changedFilesCount":3,
  "reviewedFilesCount":2,
  "excludedFilesCount":1,
  "excludedFileStats":[{"fileName":"dist/bundle.js","status":"modified","additions":1,"deletions":1}],
  "untrackedFiles":["src/new.ts"],
  "skippedUntrackedFiles":[],
  "excludedFiles":["dist/bundle.js"],
  "instructionFiles":["AGENTS.md"]
}
```

`changedFiles` lists the files actually included in the reviewed diff before truncation; `changedFileStats` adds per-reviewed-file status plus additions/deletions. `excludedFileStats` provides the same status/addition/deletion metadata for files removed by path filters, which helps CI summaries explain what was intentionally left out. `changedFilesCount` is the reviewed plus excluded total, and `reviewedFilesCount`/`excludedFilesCount` split that total for CI artifact metadata. For `all` and `uncommitted`, small untracked text files are included in review input. Large, binary, unreadable, and non-file untracked paths are skipped and listed in `skippedUntrackedFiles`. Files matching path filters are excluded before prompt construction and listed in `excludedFiles`; default filters cover common dependency/build/cache directories, lockfiles, generated outputs, sourcemaps, archives, fonts, binaries, and media assets. Auto-detected guideline files, directory-scoped guideline files along reviewed paths, and explicit `-c/--config` files are listed in `instructionFiles`. Very large instruction and local-tool prompt sections are compacted with explicit `CRX_*_TRUNCATED` markers before sending to Codex. For directory-scoped guideline names such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `.cursorrules`, crx loads matching files from the repo root and ancestor directories of reviewed files, so `src/AGENTS.md` can guide reviews that touch `src/**` without affecting unrelated paths. The effective config file is listed in `configSource` when one is found (`crx.config.json`, `.coderabbit.yaml`, or `.coderabbit.yml`).

### `warning`

Non-fatal quality-gate caveat, such as skipped untracked files or files excluded by path filters.

```json
{"type":"warning","protocolVersion":"0.2","schemaVersion":"crx.agent.v0.2","message":"Some untracked files were skipped because they were too large, binary, or unreadable.","files":["large.bin"]}
```

### `tool_result`

Emitted for each configured local tool command before the Codex review. Commands run with `shell: false`; failed blocking tools make the gate exit `3`. Failed tools include a `severity` hint for summaries and artifacts; blocking tools default to `major`, non-blocking tools default to `minor`, and `localTools[].failureSeverity` can override that value. `phase` is `pre_review` for the normal gate and `post_autofix` when `--verify-fix` reruns local tools after an applied patch.

```json
{"type":"tool_result","protocolVersion":"0.2","schemaVersion":"crx.agent.v0.2","name":"lint","command":["npm","run","lint"],"exitCode":1,"durationMs":812,"passed":false,"blocking":true,"phase":"pre_review","timedOut":false,"severity":"major","stdout":"","stderr":"lint failed"}
```

### `finding`

A validated Codex finding. Severity is one of `critical`, `major`, `minor`, `trivial`, or `info`. Optional `category` is one of `potential_issue`, `refactor_suggestion`, or `nitpick`; missing categories are treated as `potential_issue` for critical/major findings and `nitpick` otherwise.

```json
{
  "type":"finding",
  "protocolVersion":"0.2",
  "schemaVersion":"crx.agent.v0.2",
  "severity":"major",
  "category":"potential_issue",
  "fileName":"src/app.ts",
  "lineStart":42,
  "title":"Missing null guard",
  "message":"The new call path can pass undefined.",
  "impact":"Runtime crash.",
  "codegenInstructions":"Add an early guard before dereferencing.",
  "suggestions":["Return a fallback value."]
}
```

### `worktree_status`

Emitted before and after auto-fix attempts so agents can see whether the worktree was already dirty and what changed afterward. `entries` are raw `git status --porcelain=v1` lines.

```json
{"type":"worktree_status","protocolVersion":"0.2","schemaVersion":"crx.agent.v0.2","phase":"before_autofix","dirty":true,"entries":[" M src/app.ts"]}
```

### `autofix`

Emitted when `--fix` or interactive auto-fix runs.

```json
{"type":"autofix","protocolVersion":"0.2","schemaVersion":"crx.agent.v0.2","applied":true,"summary":"Applied Codex-generated patch.","changedFiles":["src/app.ts"],"needsRerun":true,"rerunCommand":"crx review --agent --type all"}
```

If `applied` is true, the gate is not clean yet. Rerun the review before treating the change set as passing.

### `complete`

Terminal event for a completed review. Blocking counts and final `exitCode` are included so agents can route decisions without re-counting every event.

```json
{"type":"complete","protocolVersion":"0.2","schemaVersion":"crx.agent.v0.2","findingsCount":0,"blockingFindingsCount":0,"blockingToolsCount":0,"exitCode":0,"summary":"0 finding(s).","autoFixApplied":false,"needsRerun":false}
```

### `error`

Terminal failure event.

```json
{"type":"error","protocolVersion":"0.2","schemaVersion":"crx.agent.v0.2","message":"Codex returned no valid JSON findings array."}
```

## Exit codes

- `0`: review completed and no `critical` or `major` findings remain in this run.
- `1`: command/review failure. In agent mode, inspect the final `error` event.
- `3`: review completed and at least one `critical`/`major` finding or blocking local tool failure remains.
- `4`: auto-fix applied a patch. The worktree changed and the agent must rerun before deciding pass/fail.

## Recommended agent loop

1. Run `crx review --agent` after a coherent change set.
2. Parse stdout JSONL only.
3. If exit `3`, fix only `critical`/`major` findings first.
4. If using `--fix` and exit `4`, inspect/keep the patch if appropriate, then rerun once. Add `--verify-fix` when configured local tools should run again immediately after the patch is applied.
5. Treat `minor`, `trivial`, and `info` as advisory unless they expose real production risk.
