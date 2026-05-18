import type { ChangedFileStat, CrxConfig } from "./types.js";

export const DEFAULT_PATH_FILTERS = [
  // Dependency, build, coverage, and cache directories.
  ".cache/**",
  ".next/**",
  ".nuxt/**",
  ".pytest_cache/**",
  ".ruff_cache/**",
  "__pycache__/**",
  "**/.cache/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.pytest_cache/**",
  "**/.ruff_cache/**",
  "**/__pycache__/**",
  "build/**",
  "coverage/**",
  "dist/**",
  "node_modules/**",
  "out/**",
  "target/**",
  "vendor/**",
  "**/target/**",
  "**/vendor/**",

  // Common lockfiles and generated source/map artifacts.
  "*.generated.*",
  "*.gen.*",
  "*.lock",
  "**/*.generated.*",
  "**/*.gen.*",
  "**/*.min.js",
  "**/*.map",
  "**/*_pb2.py",
  "**/*.pb.go",
  "Cargo.lock",
  "Gemfile.lock",
  "Pipfile.lock",
  "composer.lock",
  "go.sum",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "yarn.lock",

  // Binary, archive, font, and media assets that should not enter prompts.
  "*.7z",
  "*.avi",
  "*.bmp",
  "*.class",
  "*.dll",
  "*.dmg",
  "*.docx",
  "*.dylib",
  "*.eot",
  "*.exe",
  "*.gif",
  "*.gz",
  "*.ico",
  "*.jar",
  "*.jpeg",
  "*.jpg",
  "*.mov",
  "*.mp3",
  "*.mp4",
  "*.otf",
  "*.pdf",
  "*.png",
  "*.pptx",
  "*.pyc",
  "*.rar",
  "*.so",
  "*.tar",
  "*.tgz",
  "*.ttf",
  "*.wasm",
  "*.wav",
  "*.webm",
  "*.webp",
  "*.woff",
  "*.woff2",
  "*.xlsx",
  "*.zip"
];

export function effectivePathFilters(config: CrxConfig): string[] {
  return unique([...DEFAULT_PATH_FILTERS, ...(config.pathFilters ?? [])]);
}

export function effectiveGuidelineFiles(config: CrxConfig): string[] {
  return unique(["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules", ".github/copilot-instructions.md", ...(config.codeGuidelines?.filePatterns ?? [])]);
}

export function filterDiffByPath(diff: string, excludePatterns: string[]): { diff: string; excludedFiles: string[]; excludedFileStats: ChangedFileStat[] } {
  const chunks = splitDiffChunks(diff);
  if (!chunks.length) return { diff, excludedFiles: [], excludedFileStats: [] };

  const kept: string[] = [];
  const excludedFiles: string[] = [];
  const excludedFileStats: ChangedFileStat[] = [];
  for (const chunk of chunks) {
    const file = diffChunkPath(chunk);
    if (file && excludePatterns.some((pattern) => matchGlob(pattern, file))) {
      excludedFiles.push(file);
      const stats = diffChunkStats(chunk);
      if (stats) excludedFileStats.push(stats);
    } else {
      kept.push(chunk);
    }
  }

  return { diff: kept.join("\n"), excludedFiles: unique(excludedFiles), excludedFileStats: uniqueFileStats(excludedFileStats) };
}

export function filesFromDiff(diff: string): string[] {
  return unique(fileStatsFromDiff(diff).map((stat) => stat.fileName));
}

export function fileStatsFromDiff(diff: string): ChangedFileStat[] {
  return splitDiffChunks(diff).map(diffChunkStats).filter((stat): stat is ChangedFileStat => Boolean(stat));
}

function diffChunkStats(chunk: string): ChangedFileStat | undefined {
  const fileName = diffChunkPath(chunk);
  if (!fileName) return undefined;
  const status = /\nnew file mode /.test(chunk) ? "added" : /\ndeleted file mode /.test(chunk) ? "deleted" : /\nrename from .+\nrename to /.test(chunk) ? "renamed" : "modified";
  let additions = 0;
  let deletions = 0;
  for (const line of chunk.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { fileName, status, additions, deletions };
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
  if (regex.test(normalizedFile)) return true;
  if (!normalizedPattern.includes("/")) {
    const basename = normalizedFile.split("/").pop() ?? normalizedFile;
    return regex.test(basename);
  }
  return false;
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

function uniqueFileStats(values: ChangedFileStat[]): ChangedFileStat[] {
  const seen = new Set<string>();
  return values.filter((stat) => {
    if (seen.has(stat.fileName)) return false;
    seen.add(stat.fileName);
    return true;
  }).sort((a, b) => a.fileName.localeCompare(b.fileName));
}
