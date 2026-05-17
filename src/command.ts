export function splitCommand(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const ch of input.trim()) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if ((ch === "'" || ch === '"') && !quote) {
      quote = ch;
      continue;
    }
    if (ch === quote) {
      quote = undefined;
      continue;
    }
    if (/\s/.test(ch) && !quote) {
      if (current) out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  if (escaping) current += "\\";
  if (current) out.push(current);
  return out;
}

export function resolveCodexCommand(envValue?: string, configValue?: string): string[] {
  return splitCommand(envValue || configValue || "npx -y @openai/codex");
}
