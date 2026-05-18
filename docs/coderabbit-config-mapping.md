# CodeRabbit config concept mapping

`crx` is not a CodeRabbit client and does not read the full `.coderabbit.yaml` schema. When `crx.config.json` is absent, it can map a small, CI-relevant subset from `.coderabbit.yaml` or `.coderabbit.yml` into local settings. This page documents that subset.

## Supported local equivalents

| CodeRabbit concept | Typical `.coderabbit.yaml` location | `crx.config.json` equivalent | Notes |
|---|---|---|---|
| Review profile | `reviews.profile: chill|assertive` | `reviewProfile: "chill"` or `"assertive"` | Same two noise modes are supported locally. |
| Path filters / ignored paths | `reviews.path_filters` or ignore-style path settings | `pathFilters: ["dist/**", "*.lock"]` | `crx` filters diff blocks before prompting Codex. |
| Path instructions | `reviews.path_instructions` | `pathInstructions: [{ "pattern": "src/**/*.ts", "instructions": ["..."] }]` | `crx` includes matching instructions in the review prompt. |
| Code guidelines | `knowledge_base.code_guidelines.filePatterns` | `codeGuidelines.filePatterns` | Files are auto-loaded safely from inside the repo. |
| Tool enablement | `reviews.tools.<tool>.enabled` | `localTools` or `crx config init --preset node|python|ruby` | Commands run locally without shell interpolation and emit `tool_result` events. |
| Base branch / change set | auto-review branch settings | CLI flags: `--base`, `--base-commit`, `--type committed|uncommitted|all` | CI should choose scope explicitly per job. |

## Example migration

Starting CodeRabbit-style intent:

```yaml
reviews:
  profile: assertive
  path_instructions:
    - path: "src/**/*.ts"
      instructions: "Focus on runtime errors and unsafe async behavior."
knowledge_base:
  code_guidelines:
    filePatterns:
      - AGENTS.md
      - docs/review-guidelines.md
```

Equivalent `crx.config.json`:

```json
{
  "reviewProfile": "assertive",
  "pathInstructions": [
    {
      "pattern": "src/**/*.ts",
      "instructions": ["Focus on runtime errors and unsafe async behavior."]
    }
  ],
  "codeGuidelines": {
    "filePatterns": ["AGENTS.md", "docs/review-guidelines.md"]
  },
  "localTools": []
}
```

## Intentional non-goals

`crx` does not implement hosted PR assignment, org-level learnings, dashboards, chat commands, managed cloud tool execution, or the complete CodeRabbit YAML schema. For agent-run local/CI review, prefer explicit repo-local config and CI artifacts over hidden hosted state.
