import * as vscode from "vscode";
import * as path from "path";
import {
  gatherSolutionSnapshot,
  composeReviewPrompt,
} from "../services/solutionReviewer.js";
import { findImageFiles } from "../services/fileUtils.js";
import { requireWorkspaceRoot, writeAssessmentPrompt } from "../ui/uiUtils.js";

/**
 * Run Agent Assessment command — reads all CPS agent YAML in the workspace,
 * combines with best-practice knowledge rules, and composes a review prompt
 * for Copilot Chat to generate a prioritised review report.
 */
export async function reviewSolutionCommand(
  extensionPath: string,
): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  // Ask review scope BEFORE doing heavy parsing
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

  // Heavy work under a progress indicator
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "CPSAgentKit: Gathering agent data...",
      cancellable: false,
    },
    async () => {
      const [snapshot, reqImages, docsImages] = await Promise.all([
        gatherSolutionSnapshot(root, extensionPath),
        findImageFiles(path.join(root, "Requirements", "docs")),
        findImageFiles(path.join(root, "docs")),
      ]);
      return { snapshot, reqImages, docsImages };
    },
  );

  const { snapshot, reqImages, docsImages } = result;

  if (snapshot.agents.length === 0) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: No CPS agent folders found in the workspace. " +
        "Agent folders must contain settings.yaml and a topics/ directory.",
    );
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

  // Deduplicate images from both folders
  const uniqueImages = [...new Set([...reqImages, ...docsImages])];

  // Write assessment file and load the runner instruction into GitHub Copilot Chat
  await writeAssessmentPrompt(
    root,
    prompt,
    `${snapshot.agents.length} agent(s) (${agentNames}), ` +
      `${totalTopics} topic(s), ${totalActions} action(s).`,
    uniqueImages,
  );
}
