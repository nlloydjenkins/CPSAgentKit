import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { requireWorkspaceRoot } from "../ui/uiUtils.js";
import {
  composePreBuildChecklist,
  composeDataverseChatPrompt,
  readRequirements,
  detectDataverseMcp,
} from "../services/preBuildGenerator.js";
import { isTemplateOnly } from "../services/solutionReviewer.js";

/**
 * Run Pre-Build command — reads spec.md and architecture.md, generates a
 * checklist of portal actions the user needs to take before the Build phase.
 * Outputs a markdown document with checkboxes + automation prompts.
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
      "CPSAgentKit: Requirements/architecture.md not found. Create architecture first?",
      "Create Architecture",
      "Cancel",
    );
    if (action === "Create Architecture") {
      await vscode.commands.executeCommand("cpsAgentKit.createArchitecture");
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

  // Check Dataverse MCP configuration
  const mcpStatus = await detectDataverseMcp(root);

  // Generate the checklist
  const checklist = composePreBuildChecklist(
    spec,
    architecture,
    docs,
    mcpStatus,
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

  // If Dataverse tools exist, offer to create tables via GHCP Agent mode
  const dvPrompt = composeDataverseChatPrompt(spec, architecture);
  if (dvPrompt && mcpStatus.configured) {
    const createTables = await vscode.window.showInformationMessage(
      `CPSAgentKit: Pre-build checklist saved to Pre-Build/${filename}. ` +
        `Dataverse MCP is configured — create the tables now via Copilot Chat?`,
      "Create Tables",
      "Skip",
    );
    if (createTables === "Create Tables") {
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: dvPrompt,
        isPartialQuery: true,
      });
      vscode.window.showInformationMessage(
        "CPSAgentKit: Dataverse table prompt loaded into Copilot Chat. " +
          "Ensure you're in Agent mode, then press Enter to create the tables.",
      );
      return;
    }
  } else if (dvPrompt && !mcpStatus.configured) {
    vscode.window.showWarningMessage(
      `CPSAgentKit: Pre-build checklist saved to Pre-Build/${filename}. ` +
        `Dataverse tools detected but MCP is not configured. ` +
        `Follow the setup guide in .cpsagentkit/knowledge/dataverse-mcp-setup.md first.`,
    );
    return;
  }

  vscode.window.showInformationMessage(
    `CPSAgentKit: Pre-build checklist saved to Pre-Build/${filename}. ` +
      `Work through the checklist, then run Build Agent.`,
  );
}
