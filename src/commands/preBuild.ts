import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { requireWorkspaceRoot } from "../ui/uiUtils.js";
import {
  composePreBuildReport,
  readRequirements,
  detectPreBuildState,
} from "../services/preBuildGenerator.js";
import { isTemplateOnly } from "../services/solutionReviewer.js";

/**
 * Run Pre-Build command — reads spec.md and architecture.md, generates a
 * checklist of portal actions the user needs to take before the Build phase.
 * Outputs a markdown document with repeatable manual setup checks.
 */
export async function preBuildCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  // Require architecture.md (it defines what needs to be created)
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

  // Read requirements
  const { spec, architecture, docs } = await readRequirements(root);

  // Warn if architecture is just the empty template
  if (isTemplateOnly(architecture)) {
    const proceed = await vscode.window.showWarningMessage(
      "CPSAgentKit: architecture.md appears to be the empty template. " +
        "The pre-build checklist will be minimal. Continue anyway?",
      "Continue",
      "Cancel",
    );
    if (proceed !== "Continue") {
      return;
    }
  }

  // Detect current state from cloned agent YAML files
  const preBuildState = await detectPreBuildState(root, architecture);

  // Generate the gap-focused report
  const checklist = composePreBuildReport(
    spec,
    architecture,
    docs,
    preBuildState,
  );

  // Write to Pre-Build/ folder
  const preBuildDir = path.join(root, "Pre-Build");
  await fs.mkdir(preBuildDir, { recursive: true });

  // Find next number
  let max = 0;
  try {
    const entries = await fs.readdir(preBuildDir);
    for (const entry of entries) {
      const match = entry.match(/^pre-build-(\d+)\.md$/);
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

  const num = max + 1;
  const filename = `pre-build-${num}.md`;
  const filePath = path.join(preBuildDir, filename);

  await fs.writeFile(filePath, checklist, "utf-8");

  // Open the file
  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage(
    `CPSAgentKit: Pre-build checklist saved to Pre-Build/${filename}. ` +
      `Complete the checklist, run Pre-Build again if needed, then run Build.`,
  );
}
