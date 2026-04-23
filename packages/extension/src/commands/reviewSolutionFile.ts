import * as vscode from "vscode";
import * as path from "path";
import {
  isSolutionFileFolder,
  findSolutionFolders,
  parseSolutionFile,
  parseSolutionMetadata,
} from "../services/solutionFileParser.js";
import {
  composeReviewPrompt,
  readKnowledgeRules,
  readRequirementsDocs,
  readBestPracticesDocs,
} from "../services/solutionReviewer.js";
import { findImageFiles } from "../services/fileUtils.js";
import { requireWorkspaceRoot, writeAssessmentPrompt } from "../ui/uiUtils.js";

/**
 * Review Solution File command — lets the user pick an exported (unmanaged)
 * CPS solution folder, parses its bot.xml / botcomponents / Workflows,
 * combines with best-practice knowledge rules, and composes a review prompt
 * for Copilot Chat.
 */
export async function reviewSolutionFileCommand(
  extensionPath: string,
): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  // Detect exported solution folders in the workspace
  const detected = await findSolutionFolders(root);
  let solutionPath: string | undefined;

  if (detected.length > 0) {
    // Build QuickPick items from detected folders + a browse option
    const items: vscode.QuickPickItem[] = detected.map((p) => ({
      label: path.relative(root, p),
      description: p,
      detail: "Detected solution folder",
    }));
    items.push({
      label: "$(folder-opened) Browse for another folder...",
      description: "",
      detail: "browse",
    });

    const pick = await vscode.window.showQuickPick(items, {
      title: "CPSAgentKit: Select an exported CPS solution",
      placeHolder: `Found ${detected.length} solution folder(s) in the workspace`,
      ignoreFocusOut: true,
    });
    if (!pick) {
      return;
    }

    if (pick.detail === "browse") {
      solutionPath = await browseSolutionFolder();
    } else {
      solutionPath = pick.description;
    }
  } else {
    solutionPath = await browseSolutionFolder();
  }

  if (!solutionPath) {
    return;
  }

  // Parse metadata first (fast — single file read)
  const metadata = await parseSolutionMetadata(solutionPath);

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
      title: `CPSAgentKit: Assess Solution — ${metadata.displayName} v${metadata.version}`,
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
      title: `CPSAgentKit: Parsing ${metadata.displayName}...`,
      cancellable: false,
    },
    async () => {
      // Run all heavy reads in parallel
      const [agents, knowledgeRules, requirements, bestPractices, reqImages, docsImages] =
        await Promise.all([
          parseSolutionFile(solutionPath!),
          readKnowledgeRules(extensionPath),
          readRequirementsDocs(root),
          readBestPracticesDocs(root),
          findImageFiles(path.join(root, "Requirements", "docs")),
          findImageFiles(path.join(root, "docs")),
        ]);
      return { agents, knowledgeRules, requirements, bestPractices, reqImages, docsImages };
    },
  );

  const { agents, knowledgeRules, requirements, bestPractices, reqImages, docsImages } = result;

  if (agents.length === 0) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: No bots found in the exported solution.",
    );
    return;
  }

  // Compose the review prompt
  const prompt = composeReviewPrompt(
    agents,
    knowledgeRules,
    requirements,
    bestPractices,
    scope.detail!,
  );

  // Summary for the user
  const agentNames = agents.map((a) => a.name).join(", ");
  const totalTopics = agents.reduce((sum, a) => sum + a.topics.length, 0);
  const totalActions = agents.reduce((sum, a) => sum + a.actions.length, 0);

  // Deduplicate images from both folders
  const uniqueImages = [...new Set([...reqImages, ...docsImages])];

  await writeAssessmentPrompt(
    root,
    prompt,
    `Solution "${metadata.displayName}" v${metadata.version} — ` +
      `${agents.length} bot(s) (${agentNames}), ` +
      `${totalTopics} topic(s), ${totalActions} action(s).`,
    uniqueImages,
  );
}

/** Open a folder picker and validate it is an exported CPS solution */
async function browseSolutionFolder(): Promise<string | undefined> {
  const folderUris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select Exported Solution Folder",
    title: "CPSAgentKit: Select an exported (unmanaged) CPS solution folder",
  });

  if (!folderUris || folderUris.length === 0) {
    return undefined;
  }

  const picked = folderUris[0].fsPath;

  if (!(await isSolutionFileFolder(picked))) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: The selected folder does not appear to be an exported CPS solution. " +
        "Expected solution.xml and a botcomponents/ directory.",
    );
    return undefined;
  }

  return picked;
}
