import * as vscode from "vscode";
import {
  gatherSolutionSnapshot,
  composeReviewPrompt,
} from "../services/solutionReviewer.js";

/**
 * Run Agent Assessment command — reads all CPS agent YAML in the workspace,
 * combines with best-practice knowledge rules, and composes a review prompt
 * for Copilot Chat to generate a prioritised review report.
 */
export async function reviewSolutionCommand(
  extensionPath: string,
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage(
      "CPSAgentKit: Open a workspace folder first.",
    );
    return;
  }
  const root = workspaceFolder.uri.fsPath;

  // Gather solution data
  const snapshot = await gatherSolutionSnapshot(root, extensionPath);

  if (snapshot.agents.length === 0) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: No CPS agent folders found in the workspace. " +
        "Agent folders must contain settings.yaml and a topics/ directory.",
    );
    return;
  }

  // Ask review scope
  const scope = await vscode.window.showQuickPick(
    [
      {
        label: "Full review",
        description:
          "Review everything: prompts, descriptions, architecture, constraints",
        detail: "full",
      },
      {
        label: "Prompts & instructions",
        description:
          "Focus on agent instructions and topic-level prompt quality",
        detail: "prompts",
      },
      {
        label: "Descriptions & routing",
        description:
          "Focus on topic, tool, and agent descriptions for orchestrator routing",
        detail: "descriptions",
      },
      {
        label: "Architecture",
        description:
          "Focus on multi-agent design, agent decomposition, and patterns",
        detail: "architecture",
      },
    ],
    {
      title: "CPSAgentKit: Run Agent Assessment",
      placeHolder: "What should the review focus on?",
      ignoreFocusOut: true,
    },
  );
  if (!scope) {
    return;
  }

  // Compose the review prompt
  const prompt = composeReviewPrompt(
    snapshot.agents,
    snapshot.knowledgeRules,
    snapshot.requirements,
    snapshot.bestPractices,
    scope.detail!,
  );

  // Summary for the user
  const agentNames = snapshot.agents.map((a) => a.name).join(", ");
  const totalTopics = snapshot.agents.reduce(
    (sum, a) => sum + a.topics.length,
    0,
  );
  const totalActions = snapshot.agents.reduce(
    (sum, a) => sum + a.actions.length,
    0,
  );

  // Copy to clipboard and notify
  await vscode.env.clipboard.writeText(prompt);

  const action = await vscode.window.showInformationMessage(
    `CPSAgentKit: Assessment prompt copied to clipboard. ` +
      `Found ${snapshot.agents.length} agent(s) (${agentNames}), ` +
      `${totalTopics} topic(s), ${totalActions} action(s). ` +
      `Paste into Copilot Chat to generate the review report.`,
    "Open Copilot Chat",
  );

  if (action === "Open Copilot Chat") {
    await vscode.commands.executeCommand("workbench.action.chat.open");
  }
}
