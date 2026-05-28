import * as vscode from "vscode";
import { initCommand } from "./commands/init.js";
import { syncKnowledgeCommand } from "./commands/syncKnowledge.js";
import {
  createSpecCommand,
  preBuildAgentCommand,
} from "./commands/createSpec.js";
import { prepareForBuildCommand } from "./commands/prepareForBuild.js";
import { buildCommand } from "./commands/build.js";
import { buildAgentCommand } from "./commands/buildAgent.js";
import { generateRepoInstructionsCommand } from "./commands/generateRepoInstructions.js";
import { reviewSolutionCommand } from "./commands/reviewSolution.js";
import { reviewSolutionFileCommand } from "./commands/reviewSolutionFile.js";
import { reviewKnowledgeDocumentCommand } from "./commands/reviewKnowledgeDocument.js";
import { buildDemoCommand } from "./commands/buildDemo.js";
import { runAgentTestsCommand } from "./commands/runAgentTests.js";
import { resetDirectLineSigninCommand } from "./commands/resetDirectLineSignin.js";
import {
  configureAgentTestsCommand,
  connectAzureOpenAIJudgeCommand,
  changeAgentTestEnvironmentCommand,
} from "./commands/configureAgentTests.js";
import { AgentTestsCodeLensProvider } from "./services/testing/ui/codeLensProvider.js";
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
import { migrateLegacySettings } from "./services/migration/settingsMigration.js";
import { migrateWorkspaceMarker } from "./services/migration/workspaceMarkerMigration.js";

let statusBar: StatusBar;
let sidebarProvider: SidebarProvider;

export function activate(context: vscode.ExtensionContext): void {
  const extensionPath = context.extensionPath;
  statusBar = new StatusBar();

  // Migrate any pre-rename `cpsAgentKit.*` settings to `agentWorkbench.*`.
  // Runs once and is safe if the user is already on the new keys.
  void migrateLegacySettings(context).catch(() => {
    // Migration failures should never break activation.
  });

  // Migrate the workspace marker directory from `.cpsagentkit/` to
  // `.agent-workbench/` for each open workspace folder.
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    void migrateWorkspaceMarker(folder.uri.fsPath).catch(() => {
      // Failures are non-fatal — the resolver falls back to the legacy dir.
    });
  }

  // Sidebar tree view
  sidebarProvider = new SidebarProvider();
  const treeView = vscode.window.createTreeView("agentWorkbench.sidebar", {
    treeDataProvider: sidebarProvider,
    showCollapseAll: false,
  });

  refreshStatusFromWorkspace().catch(() => {
    statusBar.setChecking();
  });

  // Register commands
  context.subscriptions.push(
    treeView,
    sidebarProvider,
    vscode.commands.registerCommand("agentWorkbench.init", async () => {
      await initCommand(extensionPath);
      await sidebarProvider.refreshState();
      await refreshStatusFromWorkspace();
    }),
    vscode.commands.registerCommand(
      "agentWorkbench.syncKnowledge",
      async () => {
        await syncKnowledgeCommand(extensionPath, statusBar);
        await sidebarProvider.refreshState();
        await refreshStatusFromWorkspace();
      },
    ),
    vscode.commands.registerCommand("agentWorkbench.createSpec", async () => {
      await createSpecCommand();
      await sidebarProvider.refreshState();
      await refreshStatusFromWorkspace();
    }),
    vscode.commands.registerCommand(
      "agentWorkbench.preBuildAgent",
      async () => {
        await preBuildAgentCommand();
        await sidebarProvider.refreshState();
        await refreshStatusFromWorkspace();
      },
    ),
    vscode.commands.registerCommand(
      "agentWorkbench.prepareForBuild",
      async () => {
        await prepareForBuildCommand();
        await sidebarProvider.refreshState();
        await refreshStatusFromWorkspace();
      },
    ),
    vscode.commands.registerCommand(
      "agentWorkbench.buildChecklist",
      async () => {
        await buildCommand();
        await sidebarProvider.refreshState();
        await refreshStatusFromWorkspace();
      },
    ),
    vscode.commands.registerCommand("agentWorkbench.buildAgent", () =>
      buildAgentCommand(),
    ),
    vscode.commands.registerCommand(
      "agentWorkbench.generateRepoInstructions",
      () => generateRepoInstructionsCommand(),
    ),
    vscode.commands.registerCommand("agentWorkbench.reviewSolution", () =>
      reviewSolutionCommand(extensionPath),
    ),
    vscode.commands.registerCommand("agentWorkbench.reviewSolutionFile", () =>
      reviewSolutionFileCommand(extensionPath),
    ),
    vscode.commands.registerCommand(
      "agentWorkbench.reviewKnowledgeDocument",
      (uri?: vscode.Uri) => reviewKnowledgeDocumentCommand(uri),
    ),
    vscode.commands.registerCommand("agentWorkbench.buildDemo", () =>
      buildDemoCommand(extensionPath),
    ),
    vscode.commands.registerCommand(
      "agentWorkbench.runAgentTests",
      (agentFolder?: string) => runAgentTestsCommand(context, { agentFolder }),
    ),
    vscode.commands.registerCommand("agentWorkbench.configureAgentTests", () =>
      configureAgentTestsCommand(context),
    ),
    vscode.commands.registerCommand(
      "agentWorkbench.connectAzureOpenAIJudge",
      () => connectAzureOpenAIJudgeCommand(context),
    ),
    vscode.commands.registerCommand(
      "agentWorkbench.changeAgentTestEnvironment",
      () => changeAgentTestEnvironmentCommand(context),
    ),
    vscode.commands.registerCommand(
      "agentWorkbench.resetDirectLineSignin",
      () => resetDirectLineSigninCommand(context),
    ),
    vscode.languages.registerCodeLensProvider(
      [
        { language: "yaml", pattern: "**/bot/**/*.bot.{yml,yaml}" },
        { language: "yaml", pattern: "**/settings.{mcs.,}{yml,yaml}" },
      ],
      new AgentTestsCodeLensProvider(),
    ),
    vscode.commands.registerCommand("agentWorkbench.refreshSidebar", () =>
      sidebarProvider.refreshState(),
    ),
    statusBar,
  );

  // Auto-sync on workspace open if configured
  autoSyncOnOpen(extensionPath).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showWarningMessage(
      `Agent Workbench: Auto-sync failed: ${message}`,
    );
  });
}

/** Run knowledge sync automatically when the workspace opens, if enabled */
async function autoSyncOnOpen(extensionPath: string): Promise<void> {
  const syncOnOpen =
    vscode.workspace
      .getConfiguration("agentWorkbench")
      .get<boolean>("syncOnOpen") ??
    vscode.workspace
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
  statusBar.setFromProjectState(state);

  // Only auto-sync if the project is already initialised
  if (!state.isInitialised) {
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

async function refreshStatusFromWorkspace(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    statusBar.setNotInitialised();
    return;
  }

  const state = await detectProjectState(workspaceFolder.uri.fsPath);
  statusBar.setFromProjectState(state);
}

export function deactivate(): void {
  // Cleanup handled by disposables registered in context.subscriptions
}
