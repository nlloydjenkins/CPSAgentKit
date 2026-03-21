import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { readConfig, writeConfig, CpsConfig } from "../services/config.js";
import { detectProjectState } from "../services/projectState.js";
import { syncKnowledge } from "../services/knowledgeSync.js";
import { generateInstructions } from "../services/instructionsGenerator.js";

/**
 * Copy a template file into the workspace root, only if it doesn't already exist.
 * Returns true if the file was created, false if it was skipped.
 */
async function scaffoldTemplate(
  templateDir: string,
  workspaceRoot: string,
  templateName: string,
  destName: string,
): Promise<boolean> {
  const destPath = path.join(workspaceRoot, destName);
  try {
    await fs.access(destPath);
    return false; // Already exists — don't overwrite
  } catch {
    const src = path.join(templateDir, templateName);
    const content = await fs.readFile(src, "utf-8");
    await fs.writeFile(destPath, content, "utf-8");
    return true;
  }
}

/** Initialise CPS Project command handler */
export async function initCommand(extensionPath: string): Promise<void> {
  // Require an open workspace
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage(
      "CPSAgentKit: Open a workspace folder first.",
    );
    return;
  }
  const root = workspaceFolder.uri.fsPath;
  const templateDir = path.join(extensionPath, "templates");

  // Check if already initialised
  const state = await detectProjectState(root);
  if (state.isInitialised) {
    const action = await vscode.window.showInformationMessage(
      "CPSAgentKit is already initialised in this workspace. Sync knowledge instead?",
      "Sync Knowledge",
      "Re-initialise",
      "Cancel",
    );
    if (action === "Sync Knowledge") {
      await vscode.commands.executeCommand("cpsAgentKit.syncKnowledge");
      return;
    }
    if (action !== "Re-initialise") {
      return;
    }
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "CPSAgentKit: Initialising project...",
      cancellable: false,
    },
    async (progress) => {
      // Create directory structure
      progress.report({ message: "Creating folder structure..." });
      const knowledgeDir = path.join(root, ".cpsagentkit", "knowledge");
      const githubDir = path.join(root, ".github");
      await fs.mkdir(knowledgeDir, { recursive: true });
      await fs.mkdir(githubDir, { recursive: true });

      // Scaffold templates (non-destructive)
      progress.report({ message: "Scaffolding templates..." });
      await scaffoldTemplate(templateDir, root, "spec-template.md", "spec.md");
      await scaffoldTemplate(
        templateDir,
        root,
        "architecture-template.md",
        "architecture.md",
      );

      // Write initial config
      progress.report({ message: "Writing config..." });
      const config: CpsConfig = await readConfig(root);
      config.lastSyncTimestamp = null;
      await writeConfig(root, config);

      // Sync knowledge from GitHub
      progress.report({ message: "Syncing knowledge..." });
      const syncResult = await syncKnowledge(root, config, (msg) => {
        progress.report({ message: msg });
      });

      if (syncResult.errors.length > 0) {
        vscode.window.showWarningMessage(
          `CPSAgentKit: Knowledge sync completed with errors: ${syncResult.errors.join("; ")}`,
        );
      }

      // Update sync timestamp
      config.lastSyncTimestamp = new Date().toISOString();
      await writeConfig(root, config);

      // Generate copilot-instructions.md
      progress.report({ message: "Generating copilot-instructions.md..." });
      const freshState = await detectProjectState(root);
      await generateInstructions(root, templateDir, freshState);

      // Report success
      const fileCount = syncResult.filesWritten.length;
      vscode.window.showInformationMessage(
        `CPSAgentKit: Project initialised. ${fileCount} knowledge files synced.`,
      );
    },
  );

  // Open spec.md for the developer
  const specUri = vscode.Uri.file(path.join(root, "spec.md"));
  await vscode.window.showTextDocument(specUri);
}
