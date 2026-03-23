import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { readMarkdownFiles } from "../services/fileUtils.js";
import {
  requireWorkspaceRoot,
  collectList,
  copyPromptAndNotify,
} from "../ui/uiUtils.js";

/** Build spec.md content from collected answers */
function buildSpec(
  agentName: string,
  purpose: string,
  capabilities: string[],
  exclusions: string[],
  successExamples: string[],
  knowledgeSources: string[],
  interactionModel: string | undefined,
): string {
  const lines: string[] = [
    `# Agent Spec — ${agentName}`,
    "",
    "## Purpose",
    "",
    purpose,
    "",
    "## What it should do",
    "",
    ...capabilities.map((c) => `- ${c}`),
    "",
    "## What it should NOT do",
    "",
    ...exclusions.map((e) => `- ${e}`),
    "",
    "## What success looks like",
    "",
    ...successExamples.map((s) => `- ${s}`),
    "",
    "## Domain knowledge",
    "",
    ...knowledgeSources.map((k) => `- ${k}`),
  ];

  if (interactionModel) {
    lines.push("", "## Interaction model", "", interactionModel);
  }

  lines.push("");
  return lines.join("\n");
}

/** Guided spec creation wizard — walks user through each section via VS Code UI */
export async function createSpecCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  // Choose creation mode
  const mode = await vscode.window.showQuickPick(
    [
      {
        label: "Guided wizard",
        description: "Answer prompts step by step to build spec.md",
        detail: "wizard",
      },
      {
        label: "Generate from requirements docs",
        description:
          "Read documents in requirements/docs/ and generate spec via Copilot Chat",
        detail: "from-docs",
      },
    ],
    {
      title: "CPSAgentKit: Create Spec",
      placeHolder: "How do you want to create the spec?",
      ignoreFocusOut: true,
    },
  );
  if (!mode) {
    return;
  }

  if (mode.detail === "from-docs") {
    await createSpecFromDocs(root);
    return;
  }

  const requirementsDir = path.join(root, "requirements");
  const specPath = path.join(requirementsDir, "spec.md");

  // Warn if spec already exists
  try {
    await fs.access(specPath);
    const overwrite = await vscode.window.showWarningMessage(
      "requirements/spec.md already exists. Overwrite it?",
      "Overwrite",
      "Cancel",
    );
    if (overwrite !== "Overwrite") {
      return;
    }
  } catch {
    // Doesn't exist — good
  }

  // Step 1: Agent name
  const agentName = await vscode.window.showInputBox({
    title: "CPSAgentKit: Create Spec (1/7)",
    prompt: "What is the agent's name?",
    placeHolder: "e.g. Dataverse Explorer, IT Triage Bot",
    ignoreFocusOut: true,
  });
  if (!agentName) {
    return;
  }

  // Step 2: Purpose
  const purpose = await vscode.window.showInputBox({
    title: "CPSAgentKit: Create Spec (2/7)",
    prompt: "Describe the agent's purpose in one or two sentences",
    placeHolder: "e.g. Helps users find and explore Dataverse tables and data",
    ignoreFocusOut: true,
  });
  if (!purpose) {
    return;
  }

  // Step 3: Capabilities
  vscode.window.showInformationMessage(
    "Now list what the agent should do. Add items one at a time. Press Escape when done.",
  );
  const capabilities = await collectList(
    "What should the agent do?",
    "e.g. Search Dataverse tables by name or keyword",
  );
  if (capabilities.length === 0) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: At least one capability is required.",
    );
    return;
  }

  // Step 4: Exclusions
  vscode.window.showInformationMessage(
    "Now list what the agent should NOT do. Press Escape when done.",
  );
  const exclusions = await collectList(
    "What should the agent NOT do?",
    "e.g. Modify or delete data",
  );

  // Step 5: Success criteria
  vscode.window.showInformationMessage(
    "Describe what success looks like — concrete examples. Press Escape when done.",
  );
  const successExamples = await collectList(
    "What does success look like?",
    'e.g. User asks about "account" → agent returns matching tables with descriptions',
  );

  // Step 6: Knowledge/data sources
  vscode.window.showInformationMessage(
    "List the knowledge sources or systems the agent needs. Press Escape when done.",
  );
  const knowledgeSources = await collectList(
    "What knowledge or data sources does the agent need?",
    "e.g. Dataverse table metadata via API",
  );

  // Step 7: Interaction model
  const interactionStyle = await vscode.window.showQuickPick(
    [
      {
        label: "Free-form chat",
        description: "User asks anything, agent responds naturally",
        detail: "free-form",
      },
      {
        label: "Menu/command-driven",
        description: "Agent presents options, user picks from a menu",
        detail: "menu",
      },
      {
        label: "Hybrid",
        description: "Menu for main flows, free-form for help/questions",
        detail: "hybrid",
      },
    ],
    {
      title: "CPSAgentKit: Create Spec (7/7)",
      placeHolder: "How should users interact with the agent?",
      ignoreFocusOut: true,
    },
  );

  let interactionModel: string | undefined;
  if (interactionStyle?.detail === "menu") {
    interactionModel = [
      "This agent uses a **command/menu-driven** pattern:",
      "",
      "1. **Greeting** → present main menu of available actions",
      "2. **Each action** → collect required input via guided prompts",
      "3. **After each action** → present contextual next steps",
      '4. **At any point** → user can say "menu" or "start over" to return to the main menu',
      "",
      "This maps to CPS **topics with specific trigger descriptions** for each menu option, with the orchestrator routing between defined paths.",
    ].join("\n");
  } else if (interactionStyle?.detail === "hybrid") {
    interactionModel = [
      "This agent uses a **hybrid** pattern:",
      "",
      "- **Main workflows** are menu-driven with clear options presented to the user",
      "- **Help and support** questions are handled via free-form chat",
      "- The agent always offers to return to the main menu after completing an action",
    ].join("\n");
  }

  // Generate spec.md
  const content = buildSpec(
    agentName,
    purpose,
    capabilities,
    exclusions,
    successExamples,
    knowledgeSources,
    interactionModel,
  );
  await fs.mkdir(requirementsDir, { recursive: true });
  await fs.writeFile(specPath, content, "utf-8");

  // Open the generated spec
  const doc = await vscode.workspace.openTextDocument(specPath);
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage(
    `CPSAgentKit: spec.md created for "${agentName}". Review and refine with Copilot.`,
  );
}

/** Generate spec from requirements docs via Copilot Chat prompt */
async function createSpecFromDocs(root: string): Promise<void> {
  const docsDir = path.join(root, "requirements", "docs");
  const docs = await readMarkdownFiles(docsDir);

  if (docs.length === 0) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: No documents found in requirements/docs/. Add your requirements documents there first.",
    );
    return;
  }

  // Read the spec template
  const templatePath = path.join(
    path.dirname(path.dirname(__dirname)),
    "templates",
    "spec-template.md",
  );
  let template = "";
  try {
    template = await fs.readFile(templatePath, "utf-8");
  } catch {
    // Template not available — proceed without it
  }

  const prompt = [
    "You are creating a Copilot Studio agent spec. Read the requirements documents below and generate a complete spec.md.",
    "",
    "## Requirements Documents",
    "",
    ...docs.map(
      (d) =>
        `### ${d.filename.replace(/\.md$/, "").replace(/-/g, " ")}\n\n${d.content}`,
    ),
    "",
    template
      ? [
          "## Template",
          "",
          "Use this structure for the output:",
          "",
          template,
        ].join("\n")
      : "",
    "",
    "## Instructions",
    "",
    "- Fill in every section of the spec based on what you can infer from the requirements documents",
    "- If something is not clear from the documents, note it as TBD with a brief explanation of what is missing",
    "- Write the spec to requirements/spec.md",
  ].join("\n");

  await copyPromptAndNotify(
    prompt,
    "CPSAgentKit: Spec prompt copied to clipboard. Paste into Copilot Chat to generate spec.md from your requirements docs.",
  );
}
