import * as path from "path";
import { fileExists, findCpsAgentFolders } from "./fileUtils.js";

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
const REQUIREMENTS_DIR = "requirements";

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
    fileExists(path.join(requirementsDir, "spec.md")),
    fileExists(path.join(requirementsDir, "architecture.md")),
    fileExists(knowledgeDir),
    fileExists(requirementsDocsDir),
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
