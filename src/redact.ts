const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const DOTENV_SECRET = /^([+\- ]?\s*[A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL)[A-Za-z0-9_]*\s*=\s*)(.+)$/gim;
const COMMON_TOKEN = /(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})/g;

export function redactSecrets(input: string): string {
  return input
    .replace(PRIVATE_KEY, "[REDACTED_PRIVATE_KEY]")
    .replace(DOTENV_SECRET, "$1[REDACTED]")
    .replace(COMMON_TOKEN, "[REDACTED_TOKEN]");
}
