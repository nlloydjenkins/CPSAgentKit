import * as fs from "fs/promises";
import * as path from "path";
import { fileExists, findCpsAgentFolders } from "../fs/fileUtils.js";

/** Snapshot of what exists in the workspace */
export interface ProjectState {
  isInitialised: boolean;
  hasSpec: boolean;
  hasArchitecture: boolean;
  hasKnowledge: boolean;
  hasRequirementsDocs: boolean;
  hasBestPractices: boolean;
  hasCpsExtensionAgent: boolean;
  agentFolders: string[];
}

const CPS_ARCHITECT_DIR = ".agent-workbench";
const LEGACY_ARCHITECT_DIR = ".cpsagentkit";
const KNOWLEDGE_DIR = "knowledge";
const REQUIREMENTS_DIR = "Requirements";

/**
 * Return the project-state directory currently in use for `workspaceRoot`.
 * Prefers the new `.agent-workbench/`. Falls back to the legacy `.cpsagentkit/`
 * when only the legacy dir exists, so projects created before the rename keep
 * working until they are migrated.
 */
export async function resolveArchitectDir(
  workspaceRoot: string,
): Promise<string> {
  const next = path.join(workspaceRoot, CPS_ARCHITECT_DIR);
  if (await fileExists(next)) {
    return next;
  }
  const legacy = path.join(workspaceRoot, LEGACY_ARCHITECT_DIR);
  if (await fileExists(legacy)) {
    return legacy;
  }
  return next;
}

const PLACEHOLDER_LINES = new Set([
  "-",
  "1.",
  "| Document | Description |",
  "| Document | How It Influenced the Architecture |",
  "| Tool | Owner Agent | Purpose | Run As (End User / Maker / Mixed) | Manual Portal Step Required |",
  "| Source | Agent | Description | Type |",
  "| Trigger ID | Schedule | Operation | Owner Agent | Delegates To |",
  "|          |             |",
  "|          |                                    |",
  "|      |             |         |                                   |                             |",
  "|        |       |             |      |",
  "|            |          |           |             |              |",
]);

/**
 * Check if a file exists and has content that differs from the scaffolded template.
 * Returns true only if the file exists AND is not identical to the template.
 */
async function isCustomised(
  filePath: string,
  templatePaths: string[],
): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    for (const templatePath of templatePaths) {
      try {
        const template = await fs.readFile(templatePath, "utf-8");
        if (content.trim() === template.trim()) {
          return false;
        }
      } catch {
        // Try the next candidate template location.
      }
    }
    return hasMeaningfulContent(content);
  } catch {
    return false;
  }
}

function hasMeaningfulContent(content: string): boolean {
  const withoutComments = content.replace(/<!--[\s\S]*?-->/g, "");
  return withoutComments
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => {
      if (!line) return false;
      if (line.startsWith("#")) return false;
      if (line.startsWith("| ---")) return false;
      if (line.startsWith("- [ ]")) return false;
      if (/^- \*\*[^*]+:\*\*/.test(line)) return false;
      if (PLACEHOLDER_LINES.has(line)) return false;
      return true;
    });
}

/**
 * Check if a directory exists and contains at least one user file.
 */
async function dirHasFiles(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => !e.startsWith(".")).length > 0;
  } catch {
    return false;
  }
}

/** Scan the workspace and return the current project state */
export async function detectProjectState(
  workspaceRoot: string,
): Promise<ProjectState> {
  const architectDir = await resolveArchitectDir(workspaceRoot);
  const knowledgeDir = path.join(architectDir, KNOWLEDGE_DIR);
  const requirementsDir = path.join(workspaceRoot, REQUIREMENTS_DIR);
  const requirementsDocsDir = path.join(requirementsDir, "docs");
  const bestPracticesDir = path.join(architectDir, "bestpractices");

  // Locate templates — installed projects may have either workspace-local
  // source templates or synced .agent-workbench template copies.
  const localTemplateDir = path.join(workspaceRoot, "templates");
  const syncedTemplateDir = path.join(architectDir, "templates");
  const specTemplatePaths = [
    path.join(localTemplateDir, "spec-template.md"),
    path.join(syncedTemplateDir, "spec-template.md"),
  ];
  const archTemplatePaths = [
    path.join(localTemplateDir, "architecture-template.md"),
    path.join(syncedTemplateDir, "architecture-template.md"),
  ];

  const specPath = path.join(requirementsDir, "spec.md");
  const archPath = path.join(requirementsDir, "architecture.md");

  const [
    isInitialised,
    hasSpec,
    hasArchitecture,
    hasKnowledge,
    hasRequirementsDocs,
    hasBestPractices,
    agentFolders,
  ] = await Promise.all([
    fileExists(architectDir),
    isCustomised(specPath, specTemplatePaths),
    isCustomised(archPath, archTemplatePaths),
    fileExists(knowledgeDir),
    dirHasFiles(requirementsDocsDir),
    fileExists(bestPracticesDir),
    findCpsAgentFolders(workspaceRoot),
  ]);

  return {
    isInitialised,
    hasSpec,
    hasArchitecture,
    hasKnowledge,
    hasRequirementsDocs,
    hasBestPractices,
    hasCpsExtensionAgent: agentFolders.length > 0,
    agentFolders,
  };
}
