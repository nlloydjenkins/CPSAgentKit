import * as vscode from 'vscode';
import * as path from 'path';

/** Open Spec command handler — opens spec.md or offers to initialise */
export async function openSpecCommand(): Promise<void> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showErrorMessage('CPSAgentKit: Open a workspace folder first.');
		return;
	}

	const specUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, 'spec.md'));

	try {
		await vscode.workspace.fs.stat(specUri);
		await vscode.window.showTextDocument(specUri);
	} catch {
		const action = await vscode.window.showWarningMessage(
			'CPSAgentKit: spec.md does not exist. Initialise the project first?',
			'Initialise',
			'Cancel',
		);
		if (action === 'Initialise') {
			await vscode.commands.executeCommand('cpsAgentKit.init');
		}
	}
}
