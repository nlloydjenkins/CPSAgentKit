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

const CPS_ARCHITECT_DIR = ".cpsagentkit";
const KNOWLEDGE_DIR = "knowledge";
const REQUIREMENTS_DIR = "Requirements";

/**
 * Check if a file exists and has content that differs from the scaffolded template.
 * Returns true only if the file exists AND is not identical to the template.
 */
async function isCustomised(
  filePath: string,
  templatePath: string,
): Promise<boolean> {
  try {
    const [content, template] = await Promise.all([
      fs.readFile(filePath, "utf-8"),
      fs.readFile(templatePath, "utf-8"),
    ]);
    return content.trim() !== template.trim();
  } catch {
    return false;
  }
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
  const architectDir = path.join(workspaceRoot, CPS_ARCHITECT_DIR);
  const knowledgeDir = path.join(architectDir, KNOWLEDGE_DIR);
  const requirementsDir = path.join(workspaceRoot, REQUIREMENTS_DIR);
  const requirementsDocsDir = path.join(requirementsDir, "docs");
  const bestPracticesDir = path.join(
    workspaceRoot,
    ".cpsagentkit",
    "bestpractices",
  );

  // Locate templates — check both workspace-local and extension-bundled locations
  const localTemplateDir = path.join(workspaceRoot, "templates");
  const specTemplatePath = path.join(localTemplateDir, "spec-template.md");
  const archTemplatePath = path.join(
    localTemplateDir,
    "architecture-template.md",
  );

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
    isCustomised(specPath, specTemplatePath),
    isCustomised(archPath, archTemplatePath),
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
