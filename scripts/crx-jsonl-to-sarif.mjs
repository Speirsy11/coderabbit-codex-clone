#!/usr/bin/env node
import { readFileSync } from "node:fs";

const file = process.argv[2];
const input = file && file !== "-" ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
const events = input.split(/\r?\n/).filter(Boolean).map((line, index) => {
  try {
    return JSON.parse(line);
  } catch (err) {
    throw new Error(`Invalid JSONL at line ${index + 1}: ${err instanceof Error ? err.message : String(err)}`);
  }
});

const findings = events.filter((event) => event.type === "finding");
const levelForSeverity = { critical: "error", major: "error", minor: "warning", trivial: "note", info: "note" };
const rules = new Map();
const results = findings.map((finding) => {
  const severity = finding.severity ?? "info";
  const category = finding.category ?? "potential_issue";
  const ruleId = `crx/${category}/${severity}`;
  if (!rules.has(ruleId)) {
    rules.set(ruleId, {
      id: ruleId,
      name: `${category} ${severity}`,
      shortDescription: { text: `crx ${category} (${severity})` },
      properties: { category, severity }
    });
  }
  const region = {};
  if (Number.isInteger(finding.lineStart)) region.startLine = finding.lineStart;
  if (Number.isInteger(finding.lineEnd)) region.endLine = finding.lineEnd;
  return {
    ruleId,
    level: levelForSeverity[severity] ?? "note",
    message: { text: [finding.title, finding.message, finding.impact].filter(Boolean).join(" — ") },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.fileName ?? "unknown" },
          ...(Object.keys(region).length ? { region } : {})
        }
      }
    ],
    properties: {
      severity,
      category,
      codegenInstructions: finding.codegenInstructions,
      suggestions: finding.suggestions ?? []
    }
  };
});

const sarif = {
  version: "2.1.0",
  $schema: "https://json.schemastore.org/sarif-2.1.0.json",
  runs: [
    {
      tool: {
        driver: {
          name: "crx",
          informationUri: "https://github.com/Speirsy11/coderabbit-codex-clone",
          rules: [...rules.values()]
        }
      },
      results
    }
  ]
};

process.stdout.write(`${JSON.stringify(sarif, null, 2)}\n`);
process.exitCode = results.some((result) => result.level === "error") ? 3 : 0;
