import { spawn } from "node:child_process";
import { resolveCodexCommand } from "./command.js";
import type { CrxConfig } from "./types.js";

export async function runCodexExec(prompt: string, config: CrxConfig, cwd: string): Promise<string> {
  const [cmd, ...baseArgs] = resolveCodexCommand(process.env.CRX_CODEX_COMMAND, config.codexCommand);
  if (!cmd) throw new Error("No Codex command configured.");
  return runCommand(cmd, [...baseArgs, "exec", prompt], cwd, 30 * 60 * 1000);
}

export async function codexAuthStatus(config: CrxConfig): Promise<string> {
  const [cmd, ...baseArgs] = resolveCodexCommand(process.env.CRX_CODEX_COMMAND, config.codexCommand);
  if (!cmd) throw new Error("No Codex command configured.");
  return runCommand(cmd, [...baseArgs, "exec", "Reply with exactly: ok"], process.cwd(), 120000);
}

async function runCommand(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out: ${cmd}`));
    }, timeoutMs);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout || `${cmd} exited with code ${code}`));
    });
  });
}
