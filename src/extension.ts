import * as vscode from "vscode";
import { initCommand } from "./commands/init.js";
import { syncKnowledgeCommand } from "./commands/syncKnowledge.js";
import { createSpecCommand } from "./commands/createSpec.js";
import { createArchitectureCommand } from "./commands/createArchitecture.js";
import { buildCommand } from "./commands/build.js";
import { buildAgentCommand } from "./commands/buildAgent.js";
import { reviewSolutionCommand } from "./commands/reviewSolution.js";
import { detectProjectState } from "./services/projectState.js";
import { readConfig } from "./services/config.js";
import { syncKnowledge, syncBestPractices } from "./services/knowledgeSync.js";
import { generateInstructions } from "./services/instructionsGenerator.js";
import { StatusBar } from "./ui/statusBar.js";

let statusBar: StatusBar;

export function activate(context: vscode.ExtensionContext): void {
  const extensionPath = context.extensionPath;
  statusBar = new StatusBar();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("cpsAgentKit.init", () =>
      initCommand(extensionPath),
    ),
    vscode.commands.registerCommand("cpsAgentKit.syncKnowledge", () =>
      syncKnowledgeCommand(extensionPath, statusBar),
    ),
    vscode.commands.registerCommand("cpsAgentKit.createSpec", () =>
      createSpecCommand(),
    ),
    vscode.commands.registerCommand("cpsAgentKit.createArchitecture", () =>
      createArchitectureCommand(),
    ),
    vscode.commands.registerCommand("cpsAgentKit.build", () => buildCommand()),
    vscode.commands.registerCommand("cpsAgentKit.buildAgent", () =>
      buildAgentCommand(),
    ),
    vscode.commands.registerCommand("cpsAgentKit.reviewSolution", () =>
      reviewSolutionCommand(extensionPath),
    ),
    statusBar,
  );

  // Auto-sync on workspace open if configured
  autoSyncOnOpen(extensionPath).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showWarningMessage(
      `CPSAgentKit: Auto-sync failed: ${message}`,
    );
  });
}

/** Run knowledge sync automatically when the workspace opens, if enabled */
async function autoSyncOnOpen(extensionPath: string): Promise<void> {
  const syncOnOpen = vscode.workspace
    .getConfiguration("cpsAgentKit")
    .get<boolean>("syncOnOpen", true);
  if (!syncOnOpen) {
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  const root = workspaceFolder.uri.fsPath;
  const state = await detectProjectState(root);

  // Only auto-sync if the project is already initialised
  if (!state.isInitialised) {
    statusBar.setNotInitialised();
    return;
  }

  statusBar.setSyncing();

  try {
    const config = await readConfig(root);
    await syncKnowledge(root, config);
    await syncBestPractices(root, config);

    // Regenerate instructions with fresh state
    const freshState = await detectProjectState(root);
    const templateDir = `${extensionPath}/templates`;
    await generateInstructions(root, templateDir, freshState);

    statusBar.setSynced();
  } catch {
    statusBar.setError();
  }
}

export function deactivate(): void {
  // Cleanup handled by disposables registered in context.subscriptions
}
