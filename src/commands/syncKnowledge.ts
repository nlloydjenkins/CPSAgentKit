import * as vscode from "vscode";
import * as path from "path";
import { readConfig, writeConfig } from "../services/config.js";
import { detectProjectState } from "../services/projectState.js";
import {
  syncKnowledge,
  syncTemplates,
  syncBestPractices,
} from "../services/knowledgeSync.js";
import { generateInstructions } from "../services/instructionsGenerator.js";
import { StatusBar } from "../ui/statusBar.js";

/** Sync Knowledge command handler */
export async function syncKnowledgeCommand(
  extensionPath: string,
  statusBar: StatusBar,
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage(
      "CPSAgentKit: Open a workspace folder first.",
    );
    return;
  }
  const root = workspaceFolder.uri.fsPath;
  const templateDir = path.join(extensionPath, "templates");

  // Require initialised project
  const state = await detectProjectState(root);
  if (!state.isInitialised) {
    const action = await vscode.window.showWarningMessage(
      "CPSAgentKit: Project not initialised. Run init first?",
      "Initialise",
      "Cancel",
    );
    if (action === "Initialise") {
      await vscode.commands.executeCommand("cpsAgentKit.init");
    }
    return;
  }

  statusBar.setSyncing();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "CPSAgentKit: Syncing knowledge...",
      cancellable: true,
    },
    async (progress, token) => {
      const config = await readConfig(root);

      // Sync knowledge files
      const result = await syncKnowledge(root, config, (msg) => {
        if (token.isCancellationRequested) {
          return;
        }
        progress.report({ message: msg });
      });

      if (token.isCancellationRequested) {
        statusBar.setSynced();
        return;
      }

      // Sync templates
      progress.report({ message: "Syncing templates..." });
      const templateResult = await syncTemplates(root, config, (msg) => {
        if (token.isCancellationRequested) {
          return;
        }
        progress.report({ message: msg });
      });

      if (token.isCancellationRequested) {
        statusBar.setSynced();
        return;
      }

      // Sync best practices
      progress.report({ message: "Syncing best practices..." });
      const bestPracticesResult = await syncBestPractices(
        root,
        config,
        (msg) => {
          if (token.isCancellationRequested) {
            return;
          }
          progress.report({ message: msg });
        },
      );

      if (token.isCancellationRequested) {
        statusBar.setSynced();
        return;
      }

      const allErrors = [
        ...result.errors,
        ...templateResult.errors,
        ...bestPracticesResult.errors,
      ];
      if (allErrors.length > 0) {
        vscode.window.showWarningMessage(
          `CPSAgentKit: Sync completed with errors: ${allErrors.join("; ")}`,
        );
      }

      // Update timestamp
      config.lastSyncTimestamp = new Date().toISOString();
      await writeConfig(root, config);

      // Regenerate copilot-instructions.md
      progress.report({ message: "Regenerating copilot-instructions.md..." });
      const freshState = await detectProjectState(root);
      await generateInstructions(root, templateDir, freshState);

      statusBar.setSynced();

      const totalFiles =
        result.filesWritten.length +
        templateResult.filesWritten.length +
        bestPracticesResult.filesWritten.length;
      vscode.window.showInformationMessage(
        `CPSAgentKit: ${result.filesWritten.length} knowledge files, ${templateResult.filesWritten.length} template files, ${bestPracticesResult.filesWritten.length} best practice files synced.`,
      );
    },
  );
}
