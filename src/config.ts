import { access, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CrxConfig } from "./types.js";

export const CONFIG_NAME = "crx.config.json";

export function defaultConfig(): CrxConfig {
  return {
    codexCommand: "npx -y @openai/codex",
    maxDiffBytes: 180000,
    reviewProfile: "chill",
    reviewPreferences: [
      "Prioritize production bugs, security issues, command injection, secret leakage, malformed JSON, diff truncation, and Git edge cases.",
      "Do not nitpick style unless it causes a real maintainability or correctness risk.",
      "Return only structured JSON matching the requested schema."
    ],
    pathFilters: ["node_modules/**", "dist/**", "build/**", "coverage/**", "*.lock", "*.min.js", "*.map"],
    pathInstructions: [
      {
        pattern: "src/**/*.ts",
        instructions: ["Pay close attention to runtime errors, async error handling, and CLI exit-code behavior."]
      }
    ],
    codeGuidelines: {
      filePatterns: ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules", ".github/copilot-instructions.md"]
    },
    localTools: []
  };
}

export async function loadConfig(repoDir: string): Promise<CrxConfig> {
  const path = join(repoDir, CONFIG_NAME);
  try {
    await access(path);
  } catch {
    return defaultConfig();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    throw new Error(`Invalid ${CONFIG_NAME}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isRecord(parsed)) throw new Error(`Invalid ${CONFIG_NAME}: expected a JSON object.`);
  return sanitizeConfig(parsed, defaultConfig());
}

export function sanitizeConfig(input: Record<string, unknown>, defaults: CrxConfig = defaultConfig()): CrxConfig {
  const config: CrxConfig = { ...defaults };

  if (isNonEmptyString(input.codexCommand)) config.codexCommand = input.codexCommand.trim();
  if (Number.isInteger(input.maxDiffBytes) && (input.maxDiffBytes as number) >= 1000) config.maxDiffBytes = input.maxDiffBytes as number;
  if (input.reviewProfile === "chill" || input.reviewProfile === "assertive") config.reviewProfile = input.reviewProfile;
  if (Array.isArray(input.reviewPreferences)) config.reviewPreferences = input.reviewPreferences.filter(isNonEmptyString).map((value) => value.trim()).slice(0, 50);
  if (Array.isArray(input.pathFilters)) config.pathFilters = input.pathFilters.filter(isNonEmptyString).map((value) => value.trim()).slice(0, 200);

  if (Array.isArray(input.pathInstructions)) {
    config.pathInstructions = input.pathInstructions.flatMap((entry) => {
      if (!isRecord(entry) || !isNonEmptyString(entry.pattern)) return [];
      const instructions = normalizeInstructions(entry.instructions);
      return instructions.length ? [{ pattern: entry.pattern.trim(), instructions }] : [];
    }).slice(0, 100);
  }

  if (isRecord(input.codeGuidelines)) {
    const filePatterns = Array.isArray(input.codeGuidelines.filePatterns)
      ? input.codeGuidelines.filePatterns.filter(isNonEmptyString).map((value) => value.trim()).slice(0, 100)
      : defaults.codeGuidelines?.filePatterns;
    config.codeGuidelines = { filePatterns };
  }

  if (Array.isArray(input.localTools)) {
    config.localTools = input.localTools.flatMap((entry) => {
      if (!isRecord(entry) || !isNonEmptyString(entry.name)) return [];
      const command = normalizeCommand(entry.command);
      if (!command) return [];
      return [{
        name: entry.name.trim(),
        command,
        enabled: typeof entry.enabled === "boolean" ? entry.enabled : undefined,
        blocking: typeof entry.blocking === "boolean" ? entry.blocking : undefined,
        timeoutMs: normalizePositiveInt(entry.timeoutMs),
        outputLimit: normalizePositiveInt(entry.outputLimit)
      }];
    }).slice(0, 20);
  }

  return config;
}

export async function initConfig(dir: string): Promise<string> {
  const path = resolve(dir, CONFIG_NAME);
  await writeFile(path, `${JSON.stringify(defaultConfig(), null, 2)}\n`, { flag: "wx" });
  return path;
}

function normalizeCommand(value: unknown): string | string[] | undefined {
  if (isNonEmptyString(value)) return value.trim();
  if (Array.isArray(value)) {
    const parts = value.filter(isNonEmptyString).map((item) => item.trim());
    return parts.length ? parts : undefined;
  }
  return undefined;
}

function normalizePositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeInstructions(value: unknown): string[] {
  if (isNonEmptyString(value)) return [value.trim()];
  if (Array.isArray(value)) return value.filter(isNonEmptyString).map((item) => item.trim()).slice(0, 20);
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
