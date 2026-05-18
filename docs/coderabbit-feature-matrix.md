# CodeRabbit feature baseline for `crx`

Assessed against CodeRabbit docs fetched on 2026-05-18, starting from `https://docs.coderabbit.ai/llms.txt` and using current CodeRabbit docs as primary sources.

## Next-gap summary

For our goal — **agent-run local/CI code quality review after each change set** — `crx` now covers the core local/CI wedge: scoped Git diff collection, Codex-backed review, plain output, JSONL agent output, severity/category findings, path filters/instructions, guideline loading, local tool signals, CI artifacts, config preflight, `.coderabbit.yaml` subset import, and a bounded fix loop. The biggest remaining gaps versus CodeRabbit are:

1. **Hosted review UX:** PR comments, incremental hosted reviews, dashboards, and team analytics are still intentionally out of scope for the local clone.
2. **Richer configuration import:** only the safe local subset of `.coderabbit.yaml` is mapped; hosted auto-review and managed tool settings are documented but not executed.
3. **Advanced context:** organization learnings, issue/PR history, MCP context, cross-repo analysis, and AST-grep instruction ecosystems remain deferred.
4. **Optional polish:** Git hook examples and compact metrics artifacts are implemented; richer history storage would improve ergonomics but is not a blocker for local/CI quality gates.

The previous must-have wedge — **change-set scoped `crx --agent` in CI + path filters/instructions + stable JSONL schema + exit-code gate + second-pass agent loop docs** — is implemented. Future slices should avoid redoing that foundation and focus only on the remaining optional/hosted parity gaps above.

## Implementation status as of 2026-05-18

- **Implemented local/CI core:** `review --agent`, stable JSONL schema/docs, exit codes `0`/`1`/`3`/`4`, config validation, local tool checks, artifact summaries, SARIF/JUnit export, compact metrics JSON, and CI helper scripts.
- **Implemented scope/config subset:** path filters, path instructions, common guideline auto-loading with directory-scoped ancestor lookup, custom guideline patterns, `chill`/`assertive` review profiles, presets for Node/Python/Ruby, and safe `.coderabbit.yaml`/`.coderabbit.yml` fallback mapping.
- **Implemented agent-loop support:** bounded second-pass helper, auto-fix rerun signaling, post-fix local-tool verification, exact changed-file context metadata, blocker counts, config-source metadata, and no-auth fixture coverage for CI artifacts.
- **Deferred by design:** hosted PR bot behavior, dashboards, CodeRabbit API compatibility, organization learnings, MCP/cross-repo context, and fully managed sandboxed tool execution.

## Priority legend

- **P0:** needed for local/CI agent review after each change set.
- **P1:** useful soon; improves review quality or automation ergonomics.
- **P2:** later; mostly hosted/team/enterprise parity or non-core polish.

## Feature matrix

| Product area | CodeRabbit feature | Evidence | Priority for `crx` | Must-have vs later | `crx` implication |
|---|---|---|---:|---|---|
| CLI local review | Review uncommitted/local changes before commit | CLI docs say CodeRabbit scans the working directory and reviews uncommitted changes. <https://docs.coderabbit.ai/cli/index.md> | P0 | Must-have | Already core. Keep `-t uncommitted`, `committed`, `all`, `--base`, `--base-commit`, `--dir` reliable. |
| CLI local review | Plain, interactive, and agent modes | CLI supports default/plain, `--interactive`, and `--agent`. <https://docs.coderabbit.ai/cli/index.md> | P0 | Must-have for plain + agent; TUI later | Keep plain + JSONL stable. TUI can stay lightweight. |
| Agent integration | Structured JSON for agents | `--agent` emits structured JSON; reference lists `finding`, `review_context`, `status`, `complete`, `error`. <https://docs.coderabbit.ai/cli/reference.md> | P0 | Must-have | Align event names/fields closely; document schema and compatibility promises. |
| Agent integration | Findings include severity, file, agent fix instructions, suggestions | CLI reference lists severity values and fields including `fileName`, `codegenInstructions`, and `suggestions`. <https://docs.coderabbit.ai/cli/reference.md> | P0 | Must-have | Ensure every `finding` has severity, path, line/range when known, explanation, impact, and fix direction. |
| Agent integration | Long-running background review workflow | Docs note CodeRabbit reviews can take 7–30+ minutes and recommend background execution/polling by agents. <https://docs.coderabbit.ai/cli/index.md> | P0 | Must-have | CI/agent docs should say “wait quietly”; JSONL `status` events should be sparse and parse-safe. |
| Agent integration | Review-fix-rereview loop with limits | CLI docs recommend evaluate/fix, second pass, and loop limits. <https://docs.coderabbit.ai/cli/index.md> | P0 | Must-have | Codify a two-pass loop: fix critical/major only, rerun once, summarize remaining non-blockers. |
| Codex integration | Natural-language Codex plugin flow | Codex integration can trigger CodeRabbit review from Codex, summarize diff/findings, and apply fixes. <https://docs.coderabbit.ai/cli/codex-integration.md> | P1 | Later | `crx` should not need a plugin initially; provide copy-paste Codex prompts and maybe an AgentSkill later. |
| Codex integration | Scope-specific prompts: committed, uncommitted, branch vs main, security focus | Codex docs show explicit review scopes and “highest-risk” prompts. <https://docs.coderabbit.ai/cli/codex-integration.md> | P0 | Must-have | Keep CLI flags and prompt templates scope-aware; add examples for CI diff-from-base. |
| Skills | Agent-native `code-review` skill | Skills package lets compatible agents trigger review by natural language and internally uses `--agent`, `--plain`, `-t`, `--base`. <https://docs.coderabbit.ai/cli/skills.md> | P1 | Later | Add a `SKILL.md` for `crx` only after CLI schema is stable. |
| Skills | Autonomous skill loop: implement → review → fix critical/warning → rereview | Skills docs describe an autonomous review-fix loop. <https://docs.coderabbit.ai/cli/skills.md> | P1 | Later | Good model for OpenClaw/Codex skill, but CLI behavior comes first. |
| IDE extension | Automatic review after every local commit | VS Code docs support automatic reviews after commits. <https://docs.coderabbit.ai/ide/vscode-use.md> | P2 | Later | Not needed for CLI/CI; maybe offer Git hook examples instead. |
| IDE extension | Manual local review scope: all, committed, uncommitted | VS Code extension lets users choose review scope. <https://docs.coderabbit.ai/ide/vscode-use.md> | P0 | Must-have | Preserve identical scope vocabulary in CLI and docs. |
| IDE extension | “Fix with AI” handoff | VS Code extension can send complex issues to Codex CLI, Claude Code, Copilot, etc. <https://docs.coderabbit.ai/ide/vscode-use.md> and <https://docs.coderabbit.ai/ide/vscode-config.md> | P1 | Later | `crx --agent` is the handoff; richer generated prompts can come later. |
| Pull request review | Automatic PR reviews and incremental reviews on new commits | Overview says CodeRabbit reviews new PRs and incremental updates on new commits. <https://docs.coderabbit.ai/guides/code-review-overview.md> | P1 | Later for hosted PRs; must-have for CI analogue | Implement CI “review this pushed change set” before any GitHub PR bot. |
| Pull request review | Severity taxonomy: critical, major, minor, trivial, info | Review overview defines severity levels. <https://docs.coderabbit.ai/guides/code-review-overview.md> | P0 | Must-have | Already matches; use this taxonomy consistently in prompts, schema, exit codes. |
| Pull request review | Review types: potential issue, refactor suggestion, nitpick | Review overview describes these three feedback types. <https://docs.coderabbit.ai/guides/code-review-overview.md> | P1 | Later | Add optional `category` to findings after severity/path/fix fields are stable. |
| Pull request review | AI-generated PR summaries/walkthroughs | Overview lists summaries/walkthroughs. <https://docs.coderabbit.ai/guides/code-review-overview.md> | P2 | Later | Local summary is useful, but blocking findings matter more. |
| Auto-review controls | Fine-grained automatic PR review configuration | `.coderabbit.yaml` `reviews.auto_review` controls enabled, drafts, labels, branches, incremental pause, ignored authors. <https://docs.coderabbit.ai/configuration/auto-review.md> | P2 | Later | Mostly hosted PR behavior. Borrow only CI-relevant concepts: base branch and skip patterns. |
| YAML config | Repository-root `.coderabbit.yaml` is detected and branch-specific | YAML docs specify root config and branch-under-review detection. <https://docs.coderabbit.ai/getting-started/yaml-configuration.md> | P1 | Later | We have `crx.config.json`; consider supporting a small compatible subset or import/export mapping. |
| Configuration | Review profile (`chill`/`assertive`) | YAML example includes `reviews.profile`; tools docs define Chill vs Assertive. <https://docs.coderabbit.ai/getting-started/yaml-configuration.md>, <https://docs.coderabbit.ai/tools/index.md> | P1 | Later | Add `--profile chill|assertive` or config to tune noise and nitpicks. |
| Path controls | Path filters exclude generated, lock, binary, media files | Path docs describe filters and defaults. <https://docs.coderabbit.ai/configuration/path-instructions.md> | P0 | Must-have | Implement local path filtering before prompt construction to reduce noise/cost. |
| Path controls | Path instructions provide glob-scoped review guidance | Path docs show `reviews.path_instructions` with glob-specific instructions. <https://docs.coderabbit.ai/configuration/path-instructions.md> | P0 | Must-have | High leverage for local review quality; implement simple glob matching + prompt sections. |
| Structural rules | AST-based path instructions via ast-grep | AST docs describe custom rule dirs, utilities, packages, and supported languages. <https://docs.coderabbit.ai/configuration/ast-grep-instructions.md> | P2 | Later | Too much for near-term unless we shell out to `ast-grep`; start with plain path instructions. |
| Linters/security tools | 40+ linters/security tools run in sandboxed environments | Tools overview lists ESLint, Ruff, Semgrep, Checkov, Brakeman, etc. <https://docs.coderabbit.ai/tools/index.md> | P1 | Later, but soon for CI | Add opt-in local commands for project-native lint/test/security scans; no sandbox claim unless implemented. |
| Linters/security tools | Tool config via `.coderabbit.yaml` `reviews.tools.<tool>.enabled` | Tools docs show YAML enabling ESLint/Ruff/Gitleaks and config files. <https://docs.coderabbit.ai/tools/index.md> | P1 | Later | Support a small local `tools` config for common commands; surface results in JSONL. |
| Knowledge base | Context beyond diff: learnings, guidelines, multi-repo, MCP, web, issues, PRs | Knowledge base overview lists context sources and setup status. <https://docs.coderabbit.ai/knowledge-base/index.md> | P2 | Later | Hosted context is out of scope. Local docs/guidelines are the useful subset. |
| Code guidelines | Auto-detect `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, Copilot instructions, etc. | Code Guidelines docs list supported patterns and directory scoping. <https://docs.coderabbit.ai/knowledge-base/code-guidelines.md> | P0 | Implemented local subset | Auto-load common local guideline files safely, including repo-root plus ancestor-directory scoped guideline files for reviewed paths. |
| Code guidelines | Custom guideline file patterns | Docs support `knowledge_base.code_guidelines.filePatterns`. <https://docs.coderabbit.ai/knowledge-base/code-guidelines.md> | P1 | Later | Extend current `-c` instruction files with config-based patterns. |
| Learnings | Natural-language persistent review preferences | Learnings docs describe org-associated memory from chat. <https://docs.coderabbit.ai/knowledge-base/learnings.md> | P2 | Later | Avoid hosted memory. Optional local rules file is enough. |
| Multi-repo/context | Cross-repo analysis, issue tracker context, PR history | Knowledge base overview describes multi-repo, linked issues, and PR context. <https://docs.coderabbit.ai/knowledge-base/index.md> | P2 | Later | Not needed for first local/CI quality gate. |
| MCP integration | CodeRabbit acts as MCP client for external context | MCP docs describe CodeRabbit ingesting data from MCP servers for review/chat. <https://docs.coderabbit.ai/integrations/mcp-servers.md> | P2 | Later | Interesting for enterprise parity, but not MVP. |
| Finishing touches | Autofix unresolved review findings in PRs | Autofix docs apply fixes from unresolved CodeRabbit review threads and deliver commit/stacked PR. <https://docs.coderabbit.ai/finishing-touches/autofix.md> | P2 | Later | `crx --fix` can remain local-only; do not implement PR thread workflows yet. |
| Finishing touches | Autofix verification step | Autofix docs say generated fixes run setup/build verification and still deliver changes if verification fails. <https://docs.coderabbit.ai/finishing-touches/autofix.md> | P1 | Implemented local subset | `--verify-fix` reruns configured localTools after an applied patch and marks those `tool_result` events as `post_autofix`; hosted PR delivery remains out of scope. |
| Auth/billing | Browser OAuth and Agentic API key | CLI docs cover `cr auth login`, API-key usage, credits, and rate limits. <https://docs.coderabbit.ai/cli/index.md> | P2 | Later | Not applicable: `crx` uses local Codex subscription auth and should keep no CodeRabbit dependency. |
| Self-hosted | CLI/IDE can connect to self-hosted CodeRabbit | Docs list self-hosted CLI/IDE pages in llms index. <https://docs.coderabbit.ai/llms.txt> | P2 | Later | Out of scope; `crx` is local-first, not a CodeRabbit client. |
| Dashboard/metrics | IDE/CLI review metrics and dashboards | llms index lists dashboard metrics pages. <https://docs.coderabbit.ai/llms.txt> | P2 | Later | For local use, a JSON artifact/history file is enough if needed. |

## Recommended next implementation slices

### Slice 1 — CI-grade local reviewer (P0) — implemented

- Stable `crx review --agent --type committed|uncommitted|all --base ...` JSONL contract.
- Exit `3` when `critical` or `major` findings remain; `0` otherwise; controlled `error` event on failures.
- CI examples for GitHub Actions and generic shell.
- Sparse status events for long-running reviews.
- One documented two-pass agent loop.

### Slice 2 — Review scope and instructions (P0/P1) — implemented

- Path filters with safe defaults for generated/dependency/binary/media files.
- Glob-scoped path instructions.
- Auto-detected guideline files: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, `GEMINI.md`.
- Configurable extra guideline patterns.

### Slice 3 — Quality signal enrichment (P1) — implemented

- Optional local lint/test/security command integration.
- Merge command results into JSONL as `tool_result` events and artifact failures.
- Review profile: `chill` for critical/major only, `assertive` for broader suggestions.

### Explicit deferrals

- Hosted PR bot/commenting, dashboards, org learnings, MCP servers, cross-repo analysis, issue tracker validation, and CodeRabbit API compatibility.
- Full VS Code extension parity.
- AST-grep package ecosystem until simple path instructions prove useful.
