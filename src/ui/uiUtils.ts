import * as vscode from "vscode";

/**
 * Get the first workspace folder root, or show an error and return undefined.
 * Use at the top of every command handler to avoid repeating this guard.
 */
export function requireWorkspaceRoot(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage(
      "CPSAgentKit: Open a workspace folder first.",
    );
    return undefined;
  }
  return folder.uri.fsPath;
}

/**
 * Collect a list of items one at a time via VS Code input boxes.
 * Returns an empty array if the user cancels immediately.
 */
export async function collectList(
  prompt: string,
  placeholder: string,
): Promise<string[]> {
  const items: string[] = [];
  let i = 1;
  while (true) {
    const item = await vscode.window.showInputBox({
      prompt: `${prompt} (item ${i}, press Escape when done)`,
      placeHolder: placeholder,
      ignoreFocusOut: true,
    });
    if (!item?.trim()) {
      break;
    }
    items.push(item.trim());
    i++;
  }
  return items;
}

/**
 * Copy text to clipboard and offer to open Copilot Chat.
 */
export async function copyPromptAndNotify(
  prompt: string,
  message: string,
): Promise<void> {
  await vscode.env.clipboard.writeText(prompt);
  const action = await vscode.window.showInformationMessage(
    message,
    "Open Copilot Chat",
  );
  if (action === "Open Copilot Chat") {
    await vscode.commands.executeCommand("workbench.action.chat.open");
  }
}
