import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { requireWorkspaceRoot } from "../ui/uiUtils.js";
import {
  readRequirements,
  generateTopicScaffolds,
} from "../services/preBuildGenerator.js";
import { applyTopicAndTriggerCustomisationsFromArchitecture } from "../services/buildAutomation.js";
import { findCpsAgentFolders } from "../services/fileUtils.js";
import { isTemplateOnly } from "../services/solutionReviewer.js";

/**
 * Scaffold Agent Topics — generates .mcs.yml topic files from the
 * architecture's Topics table and writes them into the cloned agent's
 * topics/ folder. The user can then push to CPS with "Copilot Studio:
 * Push Changes" or `pac copilot push`.
 */
export async function scaffoldTopicsCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  // Require architecture.md
  const archPath = path.join(root, "Requirements", "architecture.md");
  try {
    await fs.access(archPath);
  } catch {
    const action = await vscode.window.showWarningMessage(
      "CPSAgentKit: Requirements/architecture.md not found. Create specification first?",
      "Create Specification",
      "Cancel",
    );
    if (action === "Create Specification") {
      await vscode.commands.executeCommand("cpsAgentKit.createSpec");
    }
    return;
  }

  const { architecture } = await readRequirements(root);

  if (isTemplateOnly(architecture)) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: architecture.md is the empty template. No topics to scaffold.",
    );
    return;
  }

  // Find the cloned agent folder
  const agentFolders = await findCpsAgentFolders(root);
  if (agentFolders.length === 0) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: No cloned CPS agent found in this workspace. " +
        "Create the agent in the portal and clone it locally first " +
        '(Copilot Studio: Get Changes or "pac copilot clone").',
    );
    return;
  }

  // If multiple agent folders, let the user choose
  let agentFolder = agentFolders[0];
  if (agentFolders.length > 1) {
    const pick = await vscode.window.showQuickPick(agentFolders, {
      placeHolder: "Select the agent to scaffold topics into",
    });
    if (!pick) {
      return;
    }
    agentFolder = pick;
  }

  const topicsDir = path.join(root, agentFolder, "topics");
  const agentRoot = path.join(root, agentFolder);

  // Generate topic scaffolds
  const scaffolds = generateTopicScaffolds(architecture);
  let writableScaffolds = [...scaffolds];

  // Check for existing files and warn about conflicts
  const existing: string[] = [];
  for (const scaffold of writableScaffolds) {
    const filePath = path.join(topicsDir, scaffold.filename);
    try {
      await fs.access(filePath);
      existing.push(scaffold.filename);
    } catch {
      // Doesn't exist — will create
    }
  }

  if (existing.length > 0) {
    const overwrite = await vscode.window.showWarningMessage(
      `CPSAgentKit: ${existing.length} topic file(s) already exist: ${existing.join(", ")}. ` +
        "Overwrite them?",
      "Overwrite",
      "Skip Existing",
      "Cancel",
    );
    if (overwrite === "Cancel" || !overwrite) {
      return;
    }
    if (overwrite === "Skip Existing") {
      // Remove conflicts from the list
      const existingSet = new Set(existing);
      writableScaffolds = writableScaffolds.filter(
        (s) => !existingSet.has(s.filename),
      );
    }
  }

  // Write the topic files
  await fs.mkdir(topicsDir, { recursive: true });
  let written = 0;
  for (const scaffold of writableScaffolds) {
    const filePath = path.join(topicsDir, scaffold.filename);
    await fs.writeFile(filePath, scaffold.content, "utf-8");
    written++;
  }

  const customisationResult =
    await applyTopicAndTriggerCustomisationsFromArchitecture(
      agentRoot,
      architecture,
    );

  // Open the first generated topic file
  const firstOpenableFile =
    written > 0
      ? path.join(topicsDir, writableScaffolds[0].filename)
      : customisationResult.updatedTopicFiles[0] ||
        customisationResult.updatedTriggerFiles[0];
  if (firstOpenableFile) {
    const doc = await vscode.workspace.openTextDocument(firstOpenableFile);
    await vscode.window.showTextDocument(doc);
  }

  if (
    written === 0 &&
    customisationResult.updatedTopicFiles.length === 0 &&
    customisationResult.updatedTriggerFiles.length === 0
  ) {
    vscode.window.showInformationMessage(
      "CPSAgentKit: No custom topics to scaffold and no matching system topics or triggers to update.",
    );
    return;
  }

  const topicNames = writableScaffolds.map((s) => s.topicName).join(", ");
  const summaryParts = [
    `scaffolded ${written} custom topic(s)`,
    `updated ${customisationResult.updatedTopicFiles.length} topic file(s)`,
    `updated ${customisationResult.updatedTriggerFiles.length} trigger file(s)`,
  ];
  const pushAction = await vscode.window.showInformationMessage(
    `CPSAgentKit: ${summaryParts.join(", ")} for ${agentFolder}. ` +
      (topicNames ? `Custom topics: ${topicNames}. ` : "") +
      'Push changes to CPS with "Copilot Studio: Push Changes" when ready.',
    "Open Topics Folder",
    "Done",
  );

  if (pushAction === "Open Topics Folder") {
    const uri = vscode.Uri.file(topicsDir);
    await vscode.commands.executeCommand("revealInExplorer", uri);
  }
}
