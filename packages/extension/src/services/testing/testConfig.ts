// Read/write .cpsagentkit/test-config.json. Never prompts — missing values trigger the wizard.
import { promises as fs } from "fs";
import * as path from "path";

export type AuthMode = "deviceCode" | "clientCredentials";
export type JudgeProviderName = "none" | "azureOpenAI" | "cpsJudgeAgent";
export type AzureOpenAIAuthMode = "entra" | "apiKey";

export interface DirectLineConfig {
  environmentHostname: string;
  tenantId: string;
  clientId: string;
  authMode: AuthMode;
}

export interface RetryConfig {
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
}

export interface AzureOpenAIJudgeConfig {
  provider: "azureOpenAI";
  endpoint: string;
  deployment: string;
  apiVersion: string;
  authMode: AzureOpenAIAuthMode;
}

export interface NoneJudgeConfig {
  provider: "none";
}

export interface CpsJudgeAgentConfig {
  provider: "cpsJudgeAgent";
  botSchemaName: string;
}

export type JudgeConfig =
  | NoneJudgeConfig
  | AzureOpenAIJudgeConfig
  | CpsJudgeAgentConfig;

export interface TestConfig {
  schemaVersion: "1.0";
  directLine: DirectLineConfig;
  retry: RetryConfig;
  judge: JudgeConfig;
}

export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 4,
  initialBackoffMs: 500,
  maxBackoffMs: 8000,
};

export const TEST_CONFIG_RELATIVE = path.join(
  ".cpsagentkit",
  "test-config.json",
);

export async function readTestConfig(
  workspaceRoot: string,
): Promise<Partial<TestConfig> | undefined> {
  const file = path.join(workspaceRoot, TEST_CONFIG_RELATIVE);
  try {
    const text = await fs.readFile(file, "utf-8");
    return JSON.parse(text) as Partial<TestConfig>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}

export async function writeTestConfig(
  workspaceRoot: string,
  config: TestConfig,
): Promise<void> {
  const file = path.join(workspaceRoot, TEST_CONFIG_RELATIVE);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function isComplete(
  config: Partial<TestConfig> | undefined,
): config is TestConfig {
  if (!config) return false;
  if (config.schemaVersion !== "1.0") return false;
  const d = config.directLine;
  if (!d || !d.environmentHostname || !d.tenantId || !d.clientId || !d.authMode)
    return false;
  if (!config.retry) return false;
  if (!config.judge) return false;
  if (config.judge.provider === "azureOpenAI") {
    const j = config.judge;
    if (!j.endpoint || !j.deployment || !j.apiVersion || !j.authMode)
      return false;
  }
  return true;
}

/** Append .cpsagentkit/ entries to workspace .gitignore if not already present. */
export async function ensureGitignore(workspaceRoot: string): Promise<void> {
  const file = path.join(workspaceRoot, ".gitignore");
  let current = "";
  try {
    current = await fs.readFile(file, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
  const required = [".cpsagentkit/test-results/", ".cpsagentkit/cache/"];
  const lines = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const additions = required.filter((entry) => !lines.has(entry));
  if (additions.length === 0) {
    return;
  }
  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  const block = [
    "",
    "# CPSAgentKit local test artefacts (auto-added)",
    ...additions,
    "",
  ].join("\n");
  await fs.writeFile(file, current + prefix + block, "utf-8");
}
