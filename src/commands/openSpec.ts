import * as vscode from "vscode";
import * as path from "path";
import { requireWorkspaceRoot } from "../ui/uiUtils.js";

/** Open Spec command handler — opens spec.md or offers to initialise */
export async function openSpecCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  const specUri = vscode.Uri.file(path.join(root, "Requirements", "spec.md"));

  try {
    await vscode.workspace.fs.stat(specUri);
    await vscode.window.showTextDocument(specUri);
  } catch {
    const action = await vscode.window.showWarningMessage(
      "CPSAgentKit: Requirements/spec.md does not exist. Initialise the project first?",
      "Initialise",
      "Cancel",
    );
    if (action === "Initialise") {
      await vscode.commands.executeCommand("cpsAgentKit.init");
    }
  }
}
