import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { composeKnowledgeDocReviewPrompt } from "@agent-workbench-for-copilot-studio/core";
import { requireWorkspaceRoot, writeAssessmentPrompt } from "../ui/uiUtils.js";

/**
 * Max bytes we will read from a candidate document before bailing out. Mirrors
 * the Agent Builder Kit's 120 KB cap on document review payloads. Larger
 * documents should be split before review anyway.
 */
const MAX_DOC_BYTES = 120_000;

/**
 * Extensions we can safely decode as UTF-8 text and hand to the doc reviewer.
 * Binary formats (PDF / DOCX / PPTX) need extraction first — for now we ask
 * the user to convert / attach via Copilot Chat directly.
 */
const TEXT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".rst",
  ".html",
  ".htm",
  ".csv",
  ".tsv",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
]);

/**
 * Review Knowledge Document — assess one candidate knowledge source against
 * the 12-dimension document-review rubric. Accepts a URI from the explorer
 * context menu, or shows a file picker. Writes a review prompt into the
 * usual `Assessment Prompts/` folder and opens GitHub Copilot Chat with the
 * runner pre-filled, matching the rest of the Assess flow.
 */
export async function reviewKnowledgeDocumentCommand(
  uri?: vscode.Uri,
): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  // Resolve the file to review.
  let target: vscode.Uri | undefined = uri;
  if (!target) {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: "Review as Knowledge Source",
      title: "Agent Workbench: Pick a document to review as a knowledge source",
      filters: {
        "Text documents": [
          "md",
          "markdown",
          "txt",
          "rst",
          "html",
          "htm",
          "csv",
          "tsv",
          "json",
          "yaml",
          "yml",
          "xml",
        ],
        "All files": ["*"],
      },
    });
    if (!picked || picked.length === 0) {
      return;
    }
    target = picked[0];
  }

  const filePath = target.fsPath;
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();

  if (!TEXT_EXTENSIONS.has(ext)) {
    const choice = await vscode.window.showWarningMessage(
      `Agent Workbench: ${filename} is not a plain-text format. ` +
        "Binary documents (PDF, DOCX, PPTX, etc.) need to be extracted to text first. " +
        "You can attach the file directly to GitHub Copilot Chat and ask it to run the " +
        "knowledge document review against its contents.",
      "Open Copilot Chat",
      "Cancel",
    );
    if (choice === "Open Copilot Chat") {
      await vscode.commands.executeCommand("workbench.action.chat.open");
    }
    return;
  }

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Agent Workbench: Could not read ${filename}: ${(err as Error).message}`,
    );
    return;
  }

  if (stat.size > MAX_DOC_BYTES) {
    vscode.window.showWarningMessage(
      `Agent Workbench: ${filename} is ${Math.round(stat.size / 1024)} KB — larger than the ` +
        `${Math.round(MAX_DOC_BYTES / 1024)} KB review cap. Split the document into smaller ` +
        "knowledge sources before reviewing — large single docs hurt retrieval anyway.",
    );
    return;
  }

  const raw = await fs.readFile(filePath, "utf-8");
  if (!raw.trim()) {
    vscode.window.showWarningMessage(
      `Agent Workbench: ${filename} is empty — nothing to review.`,
    );
    return;
  }

  const { systemPrompt, userContent } = composeKnowledgeDocReviewPrompt({
    document: raw,
    filename,
  });

  // Persist the full prompt as an assessment artefact so the user has the same
  // audit trail as a solution review.
  const promptDoc = [
    "# Knowledge Document Review",
    "",
    `**Source file**: ${path.relative(root, filePath) || filename}`,
    "",
    "## System prompt",
    "",
    "```",
    systemPrompt,
    "```",
    "",
    "## User message",
    "",
    userContent,
    "",
  ].join("\n");

  await writeAssessmentPrompt(
    root,
    promptDoc,
    `Knowledge document review queued for "${filename}".`,
  );
}
