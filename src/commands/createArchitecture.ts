import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { readMarkdownFiles, findImageFiles } from "../services/fileUtils.js";
import {
  requireWorkspaceRoot,
  collectList,
  writePromptAndOpenChat,
} from "../ui/uiUtils.js";

/** Describes a single agent in the architecture */
interface AgentEntry {
  name: string;
  role: string;
  type: string;
  tools: string[];
  knowledge: string[];
  instructions: string;
}

/** Describes a tool/connector */
interface ToolEntry {
  name: string;
  ownerAgent: string;
  purpose: string;
  manualStep: boolean;
}

/** Collect details for one agent */
async function collectAgent(
  agentNumber: number,
): Promise<AgentEntry | undefined> {
  const name = await vscode.window.showInputBox({
    title: `Agent ${agentNumber}`,
    prompt: "Agent name",
    placeHolder: "e.g. Dataverse Explorer, Billing Agent",
    ignoreFocusOut: true,
  });
  if (!name) {
    return undefined;
  }

  const role = await vscode.window.showInputBox({
    prompt: `What does "${name}" do? (one sentence)`,
    placeHolder: "e.g. Helps users find and explore Dataverse tables",
    ignoreFocusOut: true,
  });
  if (!role) {
    return undefined;
  }

  const typePick = await vscode.window.showQuickPick(
    [
      {
        label: "Standalone",
        description: "Single agent, no parent/child relationship",
        detail: "standalone",
      },
      {
        label: "Parent (router)",
        description: "Orchestrates child/connected agents",
        detail: "parent",
      },
      {
        label: "Child agent",
        description: "Embedded in parent, shares environment",
        detail: "child",
      },
      {
        label: "Connected agent",
        description: "Independent, published separately",
        detail: "connected",
      },
    ],
    {
      placeHolder: `What type is "${name}"?`,
      ignoreFocusOut: true,
    },
  );
  if (!typePick) {
    return undefined;
  }

  vscode.window.showInformationMessage(
    `List the tools/actions "${name}" uses. Escape when done.`,
  );
  const tools = await collectList(
    `Tools for "${name}"`,
    "e.g. MCP Dataverse Server, List Records action",
  );

  vscode.window.showInformationMessage(
    `List knowledge sources for "${name}". Escape when done.`,
  );
  const knowledge = await collectList(
    `Knowledge sources for "${name}"`,
    "e.g. Dataverse documentation, Internal wiki",
  );

  const instructions =
    (await vscode.window.showInputBox({
      prompt: `Key instruction focus for "${name}" (one sentence)`,
      placeHolder:
        "e.g. Always use the MCP tool before general knowledge. Read-only, decline writes.",
      ignoreFocusOut: true,
    })) || "";

  return {
    name,
    role,
    type: typePick.detail || "standalone",
    tools,
    knowledge,
    instructions,
  };
}

/** Build architecture.md from collected data */
function buildArchitecture(
  overview: string,
  agents: AgentEntry[],
  routingLogic: string,
  tools: ToolEntry[],
  manualSteps: string[],
): string {
  const lines: string[] = [
    "# Agent Architecture",
    "",
    "## Overview",
    "",
    overview,
    "",
    "## Agents",
    "",
  ];

  for (const agent of agents) {
    lines.push(
      `### ${agent.name}`,
      `- **Role:** ${agent.role}`,
      `- **Type:** ${agent.type}`,
      `- **Tools:** ${agent.tools.length > 0 ? agent.tools.join(", ") : "none"}`,
      `- **Knowledge sources:** ${agent.knowledge.length > 0 ? agent.knowledge.join(", ") : "none"}`,
      `- **Key instructions:** ${agent.instructions || "TBD"}`,
      "",
    );
  }

  lines.push(
    "## Routing Logic",
    "",
    routingLogic || "Single agent — no routing needed.",
    "",
  );

  // Tools table
  lines.push(
    "## Tools & Connectors",
    "",
    "| Tool | Owner Agent | Purpose | Manual Portal Step Required |",
    "|------|-------------|---------|---------------------------|",
  );
  for (const tool of tools) {
    lines.push(
      `| ${tool.name} | ${tool.ownerAgent} | ${tool.purpose} | ${tool.manualStep ? "Yes" : "No"} |`,
    );
  }
  if (tools.length === 0) {
    lines.push("| (none defined yet) | | | |");
  }
  lines.push("");

  // Manual steps
  lines.push("## Manual Portal Steps", "");
  if (manualSteps.length > 0) {
    manualSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  } else {
    lines.push("No manual portal steps identified yet.");
  }
  lines.push("");

  // Build state
  lines.push(
    "## Build State",
    "",
    "- [x] Spec complete",
    "- [x] Architecture approved",
    "- [ ] Agents created in portal",
    "- [ ] Tools/connectors configured",
    "- [ ] Knowledge sources added",
    "- [ ] Agent instructions written",
    "- [ ] Topic descriptions written",
    "- [ ] Tool descriptions written",
    "- [ ] Initial testing complete",
    "- [ ] Iteration complete",
    "",
  );

  return lines.join("\n");
}

/** Guided architecture creation wizard */
export async function createArchitectureCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  // Choose creation mode
  const mode = await vscode.window.showQuickPick(
    [
      {
        label: "Guided wizard",
        description: "Answer prompts step by step to build architecture.md",
        detail: "wizard",
      },
      {
        label: "Generate from requirements docs",
        description:
          "Read spec.md and documents in Requirements/docs/ and generate architecture via Copilot Chat",
        detail: "from-docs",
      },
    ],
    {
      title: "CPSAgentKit: Create Architecture",
      placeHolder: "How do you want to create the architecture?",
      ignoreFocusOut: true,
    },
  );
  if (!mode) {
    return;
  }

  if (mode.detail === "from-docs") {
    await createArchitectureFromDocs(root);
    return;
  }

  const requirementsDir = path.join(root, "Requirements");
  const archPath = path.join(requirementsDir, "architecture.md");

  // Check for spec.md
  try {
    await fs.access(path.join(requirementsDir, "spec.md"));
  } catch {
    const action = await vscode.window.showWarningMessage(
      "CPSAgentKit: spec.md not found. Create a spec first?",
      "Create Spec",
      "Continue anyway",
    );
    if (action === "Create Spec") {
      await vscode.commands.executeCommand("cpsAgentKit.createSpec");
      return;
    }
    if (!action) {
      return;
    }
  }

  // Warn if architecture already exists
  try {
    await fs.access(archPath);
    const overwrite = await vscode.window.showWarningMessage(
      "architecture.md already exists. Overwrite it?",
      "Overwrite",
      "Cancel",
    );
    if (overwrite !== "Overwrite") {
      return;
    }
  } catch {
    // Doesn't exist
  }

  // Step 1: Overview
  const overview = await vscode.window.showInputBox({
    title: "CPSAgentKit: Architecture (1/5)",
    prompt: "Describe the solution in one or two sentences",
    placeHolder:
      "e.g. Single agent that uses MCP Dataverse Server to help users explore tables and data",
    ignoreFocusOut: true,
  });
  if (!overview) {
    return;
  }

  // Step 2: How many agents?
  const agentCountPick = await vscode.window.showQuickPick(
    [
      "1 — Single agent",
      "2 — Two agents",
      "3 — Three agents",
      "4+ — More (specify)",
    ],
    {
      title: "CPSAgentKit: Architecture (2/5)",
      placeHolder: "How many agents?",
      ignoreFocusOut: true,
    },
  );
  if (!agentCountPick) {
    return;
  }

  let agentCount = parseInt(agentCountPick);
  if (isNaN(agentCount)) {
    const custom = await vscode.window.showInputBox({
      prompt: "How many agents?",
      placeHolder: "Enter a number",
      ignoreFocusOut: true,
    });
    agentCount = parseInt(custom || "1");
    if (isNaN(agentCount) || agentCount < 1) {
      agentCount = 1;
    }
  }

  // Step 3: Collect agent details
  const agents: AgentEntry[] = [];
  for (let i = 1; i <= agentCount; i++) {
    const agent = await collectAgent(i);
    if (!agent) {
      return;
    }
    agents.push(agent);
  }

  // Step 4: Routing logic (only if multi-agent)
  let routingLogic = "";
  if (agents.length > 1) {
    routingLogic =
      (await vscode.window.showInputBox({
        title: "CPSAgentKit: Architecture (4/5)",
        prompt: "How does the parent route between agents?",
        placeHolder:
          "e.g. Routes billing questions to Billing Agent, tech support to Tech Agent",
        ignoreFocusOut: true,
      })) || "";
  }

  // Step 5: Build tools list from agent tools + ask about manual steps
  const tools: ToolEntry[] = [];
  for (const agent of agents) {
    for (const toolName of agent.tools) {
      const purpose =
        (await vscode.window.showInputBox({
          prompt: `What does "${toolName}" do? (for ${agent.name})`,
          placeHolder:
            "e.g. Queries Dataverse tables, columns, and row data via MCP protocol",
          ignoreFocusOut: true,
        })) || toolName;

      const manualPick = await vscode.window.showQuickPick(["No", "Yes"], {
        placeHolder: `Does "${toolName}" require manual portal setup?`,
        ignoreFocusOut: true,
      });

      tools.push({
        name: toolName,
        ownerAgent: agent.name,
        purpose,
        manualStep: manualPick === "Yes",
      });
    }
  }

  vscode.window.showInformationMessage(
    "List any manual portal steps needed. Escape when done.",
  );
  const manualSteps = await collectList(
    "Manual portal step",
    "e.g. Create MCP server connection in CPS portal, Enable knowledge sources",
  );

  // Generate architecture.md
  const content = buildArchitecture(
    overview,
    agents,
    routingLogic,
    tools,
    manualSteps,
  );
  await fs.mkdir(requirementsDir, { recursive: true });
  await fs.writeFile(archPath, content, "utf-8");

  const doc = await vscode.workspace.openTextDocument(archPath);
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage(
    "CPSAgentKit: architecture.md created. Review and refine with Copilot.",
  );
}

/** Generate architecture from spec + requirements docs via Copilot Chat prompt */
async function createArchitectureFromDocs(root: string): Promise<void> {
  const requirementsDir = path.join(root, "Requirements");

  // Read spec.md
  let spec = "";
  try {
    spec = await fs.readFile(path.join(requirementsDir, "spec.md"), "utf-8");
  } catch {
    const action = await vscode.window.showWarningMessage(
      "CPSAgentKit: spec.md not found. Create a spec first?",
      "Create Spec",
      "Continue anyway",
    );
    if (action === "Create Spec") {
      await vscode.commands.executeCommand("cpsAgentKit.createSpec");
      return;
    }
    if (!action) {
      return;
    }
  }

  // Read requirements docs
  const docsDir = path.join(requirementsDir, "docs");
  const docs = await readMarkdownFiles(docsDir);

  // Detect images the user should paste into chat
  const imageFiles = await findImageFiles(docsDir);

  if (!spec && docs.length === 0) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: No spec.md or documents found in Requirements/docs/. Add your requirements documents there first.",
    );
    return;
  }

  // Read the architecture template
  const templatePath = path.join(
    path.dirname(path.dirname(__dirname)),
    "templates",
    "architecture-template.md",
  );
  let template = "";
  try {
    template = await fs.readFile(templatePath, "utf-8");
  } catch {
    // Template not available — proceed without it
  }

  const sections: string[] = [
    "You are creating a Copilot Studio agent architecture. Read the documents below and generate a complete architecture.md.",
  ];

  if (spec) {
    sections.push("", "## Spec", "", spec);
  }

  if (docs.length > 0) {
    sections.push(
      "",
      "## Requirements Documents",
      "",
      ...docs.map(
        (d) =>
          `### ${d.filename.replace(/\.md$/, "").replace(/-/g, " ")}\n\n${d.content}`,
      ),
    );
  }

  if (template) {
    sections.push(
      "",
      "## Template",
      "",
      "Use this structure for the output:",
      "",
      template,
    );
  }

  sections.push(
    "",
    "## Instructions",
    "",
    "- Decide how many agents are needed based on the spec and requirements",
    "- For each agent, specify its role, type (standalone/parent/child/connected), tools, and knowledge sources",
    "- Define routing logic if there are multiple agents",
    "- List all tools and connectors with their owner agent and purpose",
    "- Identify any manual portal steps required",
    "- If something is not clear from the documents, note it as TBD with a brief explanation of what is missing",
    imageFiles.length > 0
      ? "- Architecture diagrams or design images may be pasted alongside this prompt. If present, use them to inform the architecture (network topology, integration boundaries, authentication flows, agent routing, etc.)"
      : "",
    "- Write the architecture to Requirements/architecture.md",
  );

  await writePromptAndOpenChat(
    root,
    "architecture",
    sections.join("\n"),
    "Requirements/architecture.md",
    "Architecture generation from requirements docs.",
    imageFiles,
  );
}
