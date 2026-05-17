import { spawn } from "node:child_process";
import { resolveCodexCommand } from "./command.js";
import type { CrxConfig } from "./types.js";

export async function runCodexExec(prompt: string, config: CrxConfig, cwd: string): Promise<string> {
  const [cmd, ...baseArgs] = resolveTrustedCodexCommand(config);
  if (!cmd) throw new Error("No Codex command configured.");
  return runCommand(cmd, [...baseArgs, "exec", "-"], cwd, 30 * 60 * 1000, prompt);
}

export async function codexAuthStatus(config: CrxConfig): Promise<string> {
  const [cmd, ...baseArgs] = resolveTrustedCodexCommand(config);
  if (!cmd) throw new Error("No Codex command configured.");
  return runCommand(cmd, [...baseArgs, "exec", "-"], process.cwd(), 120000, "Reply with exactly: ok");
}

function resolveTrustedCodexCommand(config: CrxConfig): string[] {
  const trustedRepoCommand = process.env.CRX_TRUST_REPO_CODEX_COMMAND === "1" ? config.codexCommand : undefined;
  return resolveCodexCommand(process.env.CRX_CODEX_COMMAND, trustedRepoCommand);
}

async function runCommand(cmd: string, args: string[], cwd: string, timeoutMs: number, stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out: ${cmd}`));
    }, timeoutMs);
    let stdout = "";
    let stderr = "";
    let stdinError: Error | undefined;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdin.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE" && err.code !== "ERR_STREAM_DESTROYED") stdinError = err;
    });
    if (stdin !== undefined) child.stdin.end(stdin);
    else child.stdin.end();
    child.on("error", (err) => {
      settle(() => reject(err));
    });
    child.on("close", (code) => {
      settle(() => {
        if (code === 0 && !stdinError) resolve(stdout);
        else reject(stdinError ?? new Error(stderr || stdout || `${cmd} exited with code ${code}`));
      });
    });
  });
}
