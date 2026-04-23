import * as vscode from "vscode";
import * as path from "path";
import { requireWorkspaceRoot } from "../ui/uiUtils.js";
import { readRequirements } from "../services/preBuildGenerator.js";
import { findCpsAgentFolders } from "../services/fileUtils.js";
import { applyToolDescriptionsFromArchitecture } from "../services/buildAutomation.js";
import { isTemplateOnly } from "../services/solutionReviewer.js";

export async function applyToolDescriptionsCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  const { architecture } = await readRequirements(root);
  if (!architecture || isTemplateOnly(architecture)) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: Requirements/architecture.md is missing or still the empty template.",
    );
    return;
  }

  const agentFolders = await findCpsAgentFolders(root);
  if (agentFolders.length === 0) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: No cloned CPS agent folders found. Clone the agent first.",
    );
    return;
  }

  const selected = await vscode.window.showQuickPick(
    ["All detected agents", ...agentFolders],
    {
      title: "CPSAgentKit: Apply Tool Descriptions",
      placeHolder: "Choose which cloned agent folders to update",
      ignoreFocusOut: true,
    },
  );
  if (!selected) {
    return;
  }

  const targets =
    selected === "All detected agents" ? agentFolders : [selected];

  const updatedFiles: string[] = [];
  const unmatchedSpecs = new Set<string>();
  let totalUpdated = 0;
  let totalMatched = 0;

  for (const folder of targets) {
    const result = await applyToolDescriptionsFromArchitecture(
      path.join(root, folder),
      architecture,
    );
    totalMatched += result.matchedSpecs.length;
    for (const toolName of result.unmatchedSpecs) {
      unmatchedSpecs.add(toolName);
    }
    for (const update of result.updates) {
      if (update.updated) {
        totalUpdated++;
        updatedFiles.push(update.filePath);
      }
    }
  }

  if (updatedFiles[0]) {
    const doc = await vscode.workspace.openTextDocument(updatedFiles[0]);
    await vscode.window.showTextDocument(doc);
  }

  const unmatchedText =
    unmatchedSpecs.size > 0
      ? ` Unmatched tool descriptions: ${[...unmatchedSpecs].join(", ")}.`
      : "";
  vscode.window.showInformationMessage(
    `CPSAgentKit: Updated ${totalUpdated} action file(s). Matched ${totalMatched} tool description spec(s).${unmatchedText}`,
  );
}
