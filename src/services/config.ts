import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";

/** Persisted config stored in .cpsagentkit/config.json */
export interface CpsConfig {
  knowledgeRepoUrl: string;
  knowledgeRepoBranch: string;
  knowledgePath: string;
  templatesPath: string;
  bestPracticesPath: string;
  lastSyncTimestamp: string | null;
  version: string;
}

const CONFIG_DIR = ".cpsagentkit";
const CONFIG_FILE = "config.json";
export const CURRENT_VERSION = "0.4.18";

/** Default config values for a fresh project */
function defaults(): CpsConfig {
  return {
    knowledgeRepoUrl: getSettingOrDefault(
      "knowledgeRepoUrl",
      "https://github.com/nlloydjenkins/CPSAgentKit",
    ),
    knowledgeRepoBranch: getSettingOrDefault("knowledgeRepoBranch", "main"),
    knowledgePath: "docs/knowledge",
    templatesPath: "docs/templates",
    bestPracticesPath: "docs/bestpractices",
    lastSyncTimestamp: null,
    version: CURRENT_VERSION,
  };
}

/** Read a VS Code setting with fallback */
function getSettingOrDefault(key: string, fallback: string): string {
  const config = vscode.workspace.getConfiguration("cpsAgentKit");
  return config.get<string>(key) || fallback;
}

/** Full path to the config file */
export function configPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, CONFIG_DIR, CONFIG_FILE);
}

/** Full path to the .cpsagentkit directory */
export function configDirPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, CONFIG_DIR);
}

/** Read config from disk, returning defaults if missing or invalid */
export async function readConfig(workspaceRoot: string): Promise<CpsConfig> {
  try {
    const raw = await fs.readFile(configPath(workspaceRoot), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return defaults();
    }
    // Only pick known config keys to prevent prototype pollution
    const obj = parsed as Record<string, unknown>;
    const base = defaults();
    const knownKeys: (keyof CpsConfig)[] = [
      "knowledgeRepoUrl",
      "knowledgeRepoBranch",
      "knowledgePath",
      "templatesPath",
      "bestPracticesPath",
      "lastSyncTimestamp",
      "version",
    ];
    for (const key of knownKeys) {
      if (key in obj && obj[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (base as any)[key] = obj[key];
      }
    }
    return base;
  } catch {
    return defaults();
  }
}

/** Write config to disk, creating the directory if needed */
export async function writeConfig(
  workspaceRoot: string,
  config: CpsConfig,
): Promise<void> {
  const dir = configDirPath(workspaceRoot);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    configPath(workspaceRoot),
    JSON.stringify(config, null, 2),
    "utf-8",
  );
}

/**
 * Resolve the effective repo URL — config.json takes priority,
 * then VS Code setting, then the compiled default.
 */
export function getEffectiveRepoUrl(config: CpsConfig): string {
  if (config.knowledgeRepoUrl) {
    return config.knowledgeRepoUrl;
  }
  return getSettingOrDefault(
    "knowledgeRepoUrl",
    "https://github.com/nlloydjenkins/CPSAgentKit",
  );
}
