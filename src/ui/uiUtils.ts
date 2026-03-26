import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";

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
 * If imageFiles are provided, shows a follow-up message prompting the
 * user to paste them into the chat window.
 */
export async function copyPromptAndNotify(
  prompt: string,
  message: string,
  imageFiles?: string[],
): Promise<void> {
  await vscode.env.clipboard.writeText(prompt);
  const action = await vscode.window.showInformationMessage(
    message,
    "Open Copilot Chat",
  );
  if (action === "Open Copilot Chat") {
    await vscode.commands.executeCommand("workbench.action.chat.open");
  }

  if (imageFiles && imageFiles.length > 0) {
    const fileList = imageFiles.join(", ");
    vscode.window.showInformationMessage(
      `CPSAgentKit: Found ${imageFiles.length} image(s) in your docs folder: ${fileList}. ` +
        `Paste these into the Copilot Chat window alongside the prompt so they can be analysed ` +
        `(architecture diagrams, network topology, etc.).`,
    );
  }
}

/**
 * Find the next available assessment number by scanning the Assessment Prompts/ folder.
 */
async function nextAssessmentNumber(assessmentsDir: string): Promise<number> {
  let max = 0;
  try {
    const entries = await fs.readdir(assessmentsDir);
    for (const entry of entries) {
      const match = entry.match(/^assessment-(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > max) {
          max = n;
        }
      }
    }
  } catch {
    // Directory doesn't exist yet
  }
  return max + 1;
}

/**
 * Write an assessment prompt to the "Assessment Prompts" folder, pre-fill Copilot Chat
 * with a runner instruction, and open chat automatically.
 *
 * Returns the workspace-relative path to the written file.
 */
export async function writeAssessmentPrompt(
  workspaceRoot: string,
  prompt: string,
  summary: string,
  imageFiles?: string[],
): Promise<string> {
  const assessmentsDir = path.join(workspaceRoot, "Assessment Prompts");
  await fs.mkdir(assessmentsDir, { recursive: true });

  const num = await nextAssessmentNumber(assessmentsDir);
  const filename = `assessment-${num}.md`;
  const filePath = path.join(assessmentsDir, filename);
  const relativePath = `Assessment Prompts/${filename}`;

  await fs.writeFile(filePath, prompt, "utf-8");

  // Build the runner instruction
  const runnerLines: string[] = [
    `Read the assessment prompt file at ${relativePath} and execute it.`,
    "Follow all instructions in the file exactly.",
    "Save the report to Reports/assessment.md (create the Reports folder if it does not exist).",
  ];

  if (imageFiles && imageFiles.length > 0) {
    runnerLines.push(
      "",
      "--- REMOVE BELOW THIS LINE BEFORE SUBMITTING ---",
      "",
      `Attach these ${imageFiles.length} image(s) to this message before submitting:`,
    );
    for (const img of imageFiles) {
      runnerLines.push(`  - ${img}`);
    }
    runnerLines.push(
      "",
      "Use the paperclip icon or drag-and-drop to attach them, then delete these instructions.",
      "",
      "--- REMOVE ABOVE THIS LINE BEFORE SUBMITTING ---",
    );
  }

  const runner = runnerLines.join("\n");

  // Open the assessment file so the user can see what was generated
  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc, { preview: true });

  // Open Copilot Chat with the runner pre-filled (not submitted) in the input box
  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: runner,
    isPartialQuery: true,
  });

  vscode.window.showInformationMessage(
    `CPSAgentKit: ${summary} ` +
      `Assessment prompt saved to ${relativePath}. ` +
      `Runner instruction loaded into Copilot Chat` +
      (imageFiles && imageFiles.length > 0
        ? ` — attach the listed images, remove the instructions, then submit.`
        : ` — press Enter to submit.`),
  );

  return relativePath;
}
