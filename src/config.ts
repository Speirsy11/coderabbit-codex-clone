import { access, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CrxConfig } from "./types.js";

export const CONFIG_NAME = "crx.config.json";

export function defaultConfig(): CrxConfig {
  return {
    codexCommand: "npx -y @openai/codex",
    maxDiffBytes: 180000,
    reviewPreferences: [
      "Prioritize production bugs, security issues, command injection, secret leakage, malformed JSON, diff truncation, and Git edge cases.",
      "Do not nitpick style unless it causes a real maintainability or correctness risk.",
      "Return only structured JSON matching the requested schema."
    ]
  };
}

export async function loadConfig(repoDir: string): Promise<CrxConfig> {
  const path = join(repoDir, CONFIG_NAME);
  try {
    await access(path);
  } catch {
    return {};
  }
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as CrxConfig;
  return parsed && typeof parsed === "object" ? parsed : {};
}

export async function initConfig(dir: string): Promise<string> {
  const path = resolve(dir, CONFIG_NAME);
  await writeFile(path, `${JSON.stringify(defaultConfig(), null, 2)}\n`, { flag: "wx" });
  return path;
}
