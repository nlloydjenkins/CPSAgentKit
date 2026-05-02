import * as vscode from "vscode";
import { initCommand } from "./commands/init.js";
import { syncKnowledgeCommand } from "./commands/syncKnowledge.js";
import { createSpecCommand } from "./commands/createSpec.js";
import { prepareForBuildCommand } from "./commands/prepareForBuild.js";
import { buildAgentCommand } from "./commands/buildAgent.js";
import { generateRepoInstructionsCommand } from "./commands/generateRepoInstructions.js";
import { reviewSolutionCommand } from "./commands/reviewSolution.js";
import { reviewSolutionFileCommand } from "./commands/reviewSolutionFile.js";
import { buildDemoCommand } from "./commands/buildDemo.js";
import { detectProjectState } from "./services/projectState.js";
import { readConfig } from "./services/config.js";
import {
  syncKnowledge,
  syncBestPractices,
  syncTemplates,
} from "./services/knowledgeSync.js";
import { generateInstructions } from "./services/instructionsGenerator.js";
import { StatusBar } from "./ui/statusBar.js";
import { SidebarProvider } from "./ui/sidebarProvider.js";

let statusBar: StatusBar;
let sidebarProvider: SidebarProvider;

export function activate(context: vscode.ExtensionContext): void {
  const extensionPath = context.extensionPath;
  statusBar = new StatusBar();

  // Sidebar tree view
  sidebarProvider = new SidebarProvider();
  const treeView = vscode.window.createTreeView("cpsAgentKit.sidebar", {
    treeDataProvider: sidebarProvider,
    showCollapseAll: false,
  });

  // Register commands
  context.subscriptions.push(
    treeView,
    sidebarProvider,
    vscode.commands.registerCommand("cpsAgentKit.init", async () => {
      await initCommand(extensionPath);
      sidebarProvider.refreshState();
    }),
    vscode.commands.registerCommand("cpsAgentKit.syncKnowledge", async () => {
      await syncKnowledgeCommand(extensionPath, statusBar);
      sidebarProvider.refreshState();
    }),
    vscode.commands.registerCommand("cpsAgentKit.createSpec", async () => {
      await createSpecCommand();
      sidebarProvider.refreshState();
    }),
    vscode.commands.registerCommand("cpsAgentKit.prepareForBuild", async () => {
      await prepareForBuildCommand();
      sidebarProvider.refreshState();
    }),
    vscode.commands.registerCommand("cpsAgentKit.buildAgent", () =>
      buildAgentCommand(),
    ),
    vscode.commands.registerCommand(
      "cpsAgentKit.generateRepoInstructions",
      () => generateRepoInstructionsCommand(),
    ),
    vscode.commands.registerCommand("cpsAgentKit.reviewSolution", () =>
      reviewSolutionCommand(extensionPath),
    ),
    vscode.commands.registerCommand("cpsAgentKit.reviewSolutionFile", () =>
      reviewSolutionFileCommand(extensionPath),
    ),
    vscode.commands.registerCommand("cpsAgentKit.buildDemo", () =>
      buildDemoCommand(extensionPath),
    ),
    vscode.commands.registerCommand("cpsAgentKit.refreshSidebar", () =>
      sidebarProvider.refreshState(),
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
    await syncTemplates(root, config);

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
