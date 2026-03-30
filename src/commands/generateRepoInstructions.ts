import * as vscode from "vscode";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { requireWorkspaceRoot } from "../ui/uiUtils.js";

const execFileAsync = promisify(execFile);

export async function generateRepoInstructionsCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  const scriptPath = path.join(
    root,
    "scripts",
    "generate-repo-instructions.js",
  );
  const outputPath = path.join(root, ".github", "copilot-instructions.md");

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "CPSAgentKit: Generating repo instructions...",
        cancellable: false,
      },
      async () => {
        await execFileAsync(process.execPath, [scriptPath], { cwd: root });
      },
    );

    const action = await vscode.window.showInformationMessage(
      "CPSAgentKit: Repo-level Copilot instructions regenerated.",
      "Open File",
    );

    if (action === "Open File") {
      const doc = await vscode.workspace.openTextDocument(outputPath);
      await vscode.window.showTextDocument(doc);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `CPSAgentKit: Failed to generate repo instructions: ${message}`,
    );
  }
}
