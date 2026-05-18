import type { CrxConfig } from "./types.js";

export const DEFAULT_PATH_FILTERS = [
  "node_modules/**",
  "dist/**",
  "build/**",
  "coverage/**",
  "vendor/**",
  "*.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "*.min.js",
  "*.map",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.webp",
  "*.ico",
  "*.pdf",
  "*.zip",
  "*.tar",
  "*.gz"
];

export function effectivePathFilters(config: CrxConfig): string[] {
  return unique([...DEFAULT_PATH_FILTERS, ...(config.pathFilters ?? [])]);
}

export function effectiveGuidelineFiles(config: CrxConfig): string[] {
  return unique(["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules", ".github/copilot-instructions.md", ...(config.codeGuidelines?.filePatterns ?? [])]);
}

export function filterDiffByPath(diff: string, excludePatterns: string[]): { diff: string; excludedFiles: string[] } {
  const chunks = splitDiffChunks(diff);
  if (!chunks.length) return { diff, excludedFiles: [] };

  const kept: string[] = [];
  const excludedFiles: string[] = [];
  for (const chunk of chunks) {
    const file = diffChunkPath(chunk);
    if (file && excludePatterns.some((pattern) => matchGlob(pattern, file))) {
      excludedFiles.push(file);
    } else {
      kept.push(chunk);
    }
  }

  return { diff: kept.join("\n"), excludedFiles: unique(excludedFiles) };
}

export function filesFromDiff(diff: string): string[] {
  return unique(splitDiffChunks(diff).map((chunk) => diffChunkPath(chunk)).filter((file): file is string => Boolean(file)));
}

export function renderPathInstructions(config: CrxConfig, files: string[]): string {
  const matches = (config.pathInstructions ?? []).filter((item) => files.some((file) => matchGlob(item.pattern, file)));
  if (!matches.length) return "(none)";
  return matches
    .map((item) => {
      const instructions = Array.isArray(item.instructions) ? item.instructions.join(" ") : item.instructions;
      return `- ${item.pattern}: ${instructions}`;
    })
    .join("\n");
}

export function matchesPathPattern(file: string, pattern: string): boolean {
  return matchGlob(pattern, file);
}

export function matchGlob(pattern: string, file: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const normalizedFile = file.replace(/\\/g, "/");
  const regex = new RegExp(`^${escapeGlob(normalizedPattern)}$`);
  return regex.test(normalizedFile);
}

function splitDiffChunks(diff: string): string[] {
  const lines = diff.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith("diff --git ") && current.length) {
      chunks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.some((line) => line.trim())) chunks.push(current.join("\n"));
  return chunks;
}

function diffChunkPath(chunk: string): string | undefined {
  const first = chunk.split("\n", 1)[0] ?? "";
  const match = first.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (match) return stripQuotes(match[2]);
  const plus = chunk.match(/^\+\+\+ b\/(.+)$/m);
  return plus ? stripQuotes(plus[1]) : undefined;
}

function stripQuotes(path: string): string {
  return path.replace(/^"|"$/g, "");
}

function escapeGlob(pattern: string): string {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    const next = pattern[i + 1];
    if (ch === "*" && next === "*") {
      if (pattern[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i++;
      }
    } else if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
