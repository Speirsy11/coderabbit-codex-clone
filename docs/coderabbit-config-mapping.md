# CodeRabbit config concept mapping

`crx` is not a CodeRabbit client and does not read the full `.coderabbit.yaml` schema. Native `crx.config.json` is preferred and always wins when present. If it is absent, `crx` can load a safe, CI-relevant subset from `.coderabbit.yaml` or `.coderabbit.yml`, then passes the mapped values through the same config sanitizer as native config.

## Supported local equivalents

| CodeRabbit concept | Typical `.coderabbit.yaml` location | `crx.config.json` equivalent | Fallback import support | Notes |
|---|---|---|---|---|
| Review profile | `reviews.profile: chill|assertive` | `reviewProfile: "chill"` or `"assertive"` | Yes | Same two noise modes are supported locally. |
| Path filters / ignored paths | `reviews.path_filters` or ignore-style path settings | `pathFilters: ["dist/**", "*.lock"]` | Yes, from `reviews.path_filters` | `crx` filters diff blocks before prompting Codex. |
| Path instructions | `reviews.path_instructions` | `pathInstructions: [{ "pattern": "src/**/*.ts", "instructions": ["..."] }]` | Yes, from `path` or `pattern` plus string/list `instructions` | `crx` includes matching instructions in the review prompt. |
| Code guidelines | `knowledge_base.code_guidelines.filePatterns` | `codeGuidelines.filePatterns` | Yes | Files are auto-loaded safely from inside the repo. |
| Tool enablement | `reviews.tools.<tool>.enabled` | `localTools` or `crx config init --preset node|python|ruby` | No | Commands run locally without shell interpolation and emit `tool_result` events. Keep command execution explicit in native `crx.config.json`. |
| Base branch / change set | auto-review branch settings | CLI flags: `--base`, `--base-commit`, `--type committed|uncommitted|all` | No | CI should choose scope explicitly per job. |

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

Equivalent native `crx.config.json`:

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

## Fallback loading behavior

When `crx.config.json` is missing, `loadConfig()` checks `.coderabbit.yaml` and then `.coderabbit.yml`. The fallback parser is intentionally small and dependency-free: it supports the scalar, list, and list-of-map shapes needed for the fields above, ignores unsupported hosted settings, and never enables local commands from CodeRabbit YAML.

Use fallback loading as a migration bridge. For long-lived CI, prefer committing an explicit `crx.config.json` so command execution, presets, and future `crx`-specific settings are visible to agents and reviewers.

## Intentional non-goals

`crx` does not implement hosted PR assignment, org-level learnings, dashboards, chat commands, managed cloud tool execution, or the complete CodeRabbit YAML schema. For agent-run local/CI review, prefer explicit repo-local config and CI artifacts over hidden hosted state.
