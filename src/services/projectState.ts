import * as fs from 'fs/promises';
import * as path from 'path';

/** Snapshot of what exists in the workspace */
export interface ProjectState {
	isInitialised: boolean;
	hasSpec: boolean;
	hasArchitecture: boolean;
	hasKnowledge: boolean;
	hasCpsExtensionAgent: boolean;
	agentFolders: string[];
}

const CPS_ARCHITECT_DIR = '.cpsagentkit';
const KNOWLEDGE_DIR = 'knowledge';

/** Check if a path exists */
async function exists(p: string): Promise<boolean> {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

/**
 * Detect CPS extension agent folders — any directory containing
 * both settings.yaml and a topics/ subdirectory.
 */
async function findCpsAgentFolders(workspaceRoot: string): Promise<string[]> {
	const agents: string[] = [];
	try {
		const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith('.')) {
				continue;
			}
			const dir = path.join(workspaceRoot, entry.name);
			const hasSettings = await exists(path.join(dir, 'settings.yaml'));
			const hasTopics = await exists(path.join(dir, 'topics'));
			if (hasSettings && hasTopics) {
				agents.push(entry.name);
			}
		}
	} catch {
		// Workspace listing failed — return empty
	}
	return agents;
}

/** Scan the workspace and return the current project state */
export async function detectProjectState(workspaceRoot: string): Promise<ProjectState> {
	const architectDir = path.join(workspaceRoot, CPS_ARCHITECT_DIR);
	const knowledgeDir = path.join(architectDir, KNOWLEDGE_DIR);

	const [isInitialised, hasSpec, hasArchitecture, hasKnowledge, agentFolders] = await Promise.all([
		exists(architectDir),
		exists(path.join(workspaceRoot, 'spec.md')),
		exists(path.join(workspaceRoot, 'architecture.md')),
		exists(knowledgeDir),
		findCpsAgentFolders(workspaceRoot),
	]);

	return {
		isInitialised,
		hasSpec,
		hasArchitecture,
		hasKnowledge,
		hasCpsExtensionAgent: agentFolders.length > 0,
		agentFolders,
	};
}
