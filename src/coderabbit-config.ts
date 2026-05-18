import type { CrxConfig } from "./types.js";

export const CODERABBIT_CONFIG_NAMES = [".coderabbit.yaml", ".coderabbit.yml"] as const;

export function codeRabbitYamlToCrxConfig(text: string): Partial<CrxConfig> {
  const parsed = parseYamlSubset(text);
  const root = isRecord(parsed) ? parsed : {};
  const reviews = recordAt(root, "reviews");
  const knowledgeBase = recordAt(root, "knowledge_base");
  const codeGuidelines = recordAt(knowledgeBase, "code_guidelines");
  const mapped: Partial<CrxConfig> = {};

  const profile = stringAt(reviews, "profile");
  if (profile === "chill" || profile === "assertive") mapped.reviewProfile = profile;

  const pathFilters = stringsAt(reviews, "path_filters");
  if (pathFilters.length) mapped.pathFilters = pathFilters;

  const pathInstructions = pathInstructionsAt(reviews, "path_instructions");
  if (pathInstructions.length) mapped.pathInstructions = pathInstructions;

  const filePatterns = stringsAt(codeGuidelines, "filePatterns");
  if (filePatterns.length) mapped.codeGuidelines = { filePatterns };

  return mapped;
}

function pathInstructionsAt(record: Record<string, unknown>, key: string): NonNullable<CrxConfig["pathInstructions"]> {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const pattern = stringAt(entry, "path") || stringAt(entry, "pattern");
    const instructions = stringsAt(entry, "instructions");
    return pattern && instructions.length ? [{ pattern, instructions }] : [];
  });
}

function stringsAt(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function stringAt(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordAt(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

type YamlLine = { indent: number; text: string };

function parseYamlSubset(text: string): unknown {
  const lines = text.split(/\r?\n/).flatMap((raw): YamlLine[] => {
    const withoutComment = stripComment(raw);
    if (!withoutComment.trim()) return [];
    return [{ indent: withoutComment.match(/^ */)?.[0].length ?? 0, text: withoutComment.trimEnd() }];
  });
  return parseBlock(lines, 0, 0).value;
}

function parseBlock(lines: YamlLine[], index: number, indent: number): { value: unknown; next: number } {
  if (index >= lines.length) return { value: {}, next: index };
  return lines[index].text.trimStart().startsWith("-") ? parseList(lines, index, indent) : parseMap(lines, index, indent);
}

function parseMap(lines: YamlLine[], index: number, indent: number): { value: Record<string, unknown>; next: number } {
  const value: Record<string, unknown> = {};
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent > indent) { index++; continue; }
    const match = line.text.trim().match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!match) { index++; continue; }
    const key = match[1];
    const rest = match[2] ?? "";
    if (rest.trim()) {
      value[key] = parseScalar(rest.trim());
      index++;
    } else {
      const child = parseBlock(lines, index + 1, indent + 2);
      value[key] = child.value;
      index = child.next;
    }
  }
  return { value, next: index };
}

function parseList(lines: YamlLine[], index: number, indent: number): { value: unknown[]; next: number } {
  const value: unknown[] = [];
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent > indent) { index++; continue; }
    const trimmed = line.text.trim();
    if (!trimmed.startsWith("-")) break;
    const rest = trimmed.slice(1).trim();
    if (!rest) {
      const child = parseBlock(lines, index + 1, indent + 2);
      value.push(child.value);
      index = child.next;
      continue;
    }
    const keyValue = rest.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (keyValue) {
      const item: Record<string, unknown> = {};
      item[keyValue[1]] = keyValue[2]?.trim() ? parseScalar(keyValue[2].trim()) : {};
      const child = parseMap(lines, index + 1, indent + 2);
      value.push({ ...item, ...child.value });
      index = child.next;
    } else {
      value.push(parseScalar(rest));
      index++;
    }
  }
  return { value, next: index };
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed.slice(1, -1).split(",").map((part) => parseScalar(part.trim())).filter((part) => part !== "");
  return trimmed;
}

function stripComment(line: string): string {
  let quote: string | undefined;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && line[i - 1] !== "\\") quote = quote === ch ? undefined : quote ?? ch;
    if (ch === "#" && !quote) return line.slice(0, i);
  }
  return line;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
