import * as vscode from 'vscode';
import * as path from 'path';
import { detectProjectState } from '../services/projectState.js';
import { generateInstructions } from '../services/instructionsGenerator.js';

/** Regenerate copilot-instructions.md from current project state + knowledge */
export async function refreshCommand(extensionPath: string): Promise<void> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showErrorMessage('CPSAgentKit: Open a workspace folder first.');
		return;
	}
	const root = workspaceFolder.uri.fsPath;
	const templateDir = path.join(extensionPath, 'templates');

	const state = await detectProjectState(root);
	if (!state.isInitialised) {
		vscode.window.showWarningMessage('CPSAgentKit: Project not initialised. Run init first.');
		return;
	}

	await generateInstructions(root, templateDir, state);

	const phase = state.hasSpec && state.hasArchitecture ? 'Build'
		: state.hasSpec ? 'Architect'
		: 'Define';

	vscode.window.showInformationMessage(
		`CPSAgentKit: copilot-instructions.md regenerated. Current phase: ${phase}.`,
	);
}
