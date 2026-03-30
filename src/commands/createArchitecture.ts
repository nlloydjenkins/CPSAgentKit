import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { buildCpsGuidancePack } from "../services/cpsGuidanceContext.js";
import { readMarkdownFiles, findImageFiles } from "../services/fileUtils.js";
import {
  CURATED_CONNECTOR_CATALOG,
  resolveCuratedConnectorRequirement,
} from "../services/connectorCatalog.js";
import {
  requireWorkspaceRoot,
  collectList,
  writePromptAndOpenChat,
} from "../ui/uiUtils.js";

/** Describes a single agent in the architecture */
export interface AgentEntry {
  name: string;
  role: string;
  type: string;
  tools: string[];
  knowledge: string[];
  instructions: string;
}

/** Describes a tool/connector */
export interface ToolEntry {
  name: string;
  ownerAgent: string;
  purpose: string;
  manualStep: boolean;
}

interface NormalizedArchitectureTool {
  displayName: string;
  ownerAgent: string;
  purposes: string[];
  manualStep: boolean;
  notes: string[];
}

function normalizeArchitectureTools(
  tools: ToolEntry[],
): NormalizedArchitectureTool[] {
  const grouped = new Map<string, NormalizedArchitectureTool>();

  for (const tool of tools) {
    const curatedConnector = resolveCuratedConnectorRequirement(
      tool.name,
      tool.purpose,
    );
    const displayName = curatedConnector
      ? `${curatedConnector.connectorName} - ${curatedConnector.actionName}`
      : tool.name;
    const notes = curatedConnector?.notes ?? [];
    const key = `${tool.ownerAgent}::${displayName.toLowerCase()}`;
    const existing = grouped.get(key);

    if (existing) {
      if (!existing.purposes.includes(tool.purpose)) {
        existing.purposes.push(tool.purpose);
      }
      existing.manualStep = existing.manualStep || tool.manualStep;
      for (const note of notes) {
        if (!existing.notes.includes(note)) {
          existing.notes.push(note);
        }
      }
      continue;
    }

    grouped.set(key, {
      displayName,
      ownerAgent: tool.ownerAgent,
      purposes: [tool.purpose],
      manualStep: tool.manualStep,
      notes: [...notes],
    });
  }

  return [...grouped.values()];
}

function countToolsByAgent(
  agents: AgentEntry[],
  tools: ToolEntry[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const normalizedTools = normalizeArchitectureTools(tools);
  for (const agent of agents) {
    counts.set(agent.name, 0);
  }
  for (const tool of normalizedTools) {
    counts.set(tool.ownerAgent, (counts.get(tool.ownerAgent) || 0) + 1);
  }
  return counts;
}

function buildAppliedConstraints(
  agents: AgentEntry[],
  tools: ToolEntry[],
  manualSteps: string[],
): string[] {
  const items: string[] = [
    "Tool descriptions must be written as real modelDescription text, not left as platform defaults.",
  ];

  if (agents.some((agent) => agent.type === "child")) {
    items.push(
      "Child agents cannot own autonomous triggers; any proactive trigger must stay on the top-level parent agent.",
    );
  }

  if (
    tools.some(
      (tool) =>
        tool.name.toLowerCase().includes("mcp") &&
        agents.some(
          (agent) =>
            agent.name === tool.ownerAgent &&
            agent.type.toLowerCase() === "child",
        ),
    )
  ) {
    items.push(
      "MCP tools on child agents require explicit parent-orchestration justification because child-agent MCP execution is unreliable through parent orchestration.",
    );
  }

  if (
    tools.some((tool) => {
      const lower = `${tool.name} ${tool.purpose}`.toLowerCase();
      return (
        lower.includes("flow") ||
        lower.includes("power automate") ||
        lower.includes("cloud flow")
      );
    })
  ) {
    items.push(
      "Power Automate flows need an explicit run-as and governance review because they run as the author by default.",
    );
  }

  if (
    !manualSteps.some((step) =>
      step.toLowerCase().includes("content moderation"),
    )
  ) {
    items.push(
      "Content moderation is portal-only and must be captured in manual portal steps if the domain needs an explicit setting decision.",
    );
  }

  const toolCounts = countToolsByAgent(agents, tools);
  for (const [agentName, count] of toolCounts.entries()) {
    items.push(
      count > 30
        ? `${agentName} currently exceeds the practical 25-30 tool limit and should be decomposed before build.`
        : `${agentName} remains within the practical per-agent tool budget (${count} tool${count === 1 ? "" : "s"}).`,
    );
  }

  return items;
}

function buildBestPracticeDecisions(
  agents: AgentEntry[],
  tools: ToolEntry[],
): string[] {
  const items: string[] = [];

  if (agents.length === 1) {
    items.push(
      "Keep a single-agent design unless tool count, governance boundaries, or domain ownership clearly justify decomposition.",
    );
  } else {
    items.push(
      "Multi-agent decomposition should only remain where domain scope, governance, or tool partitioning is materially different between agents.",
    );
  }

  if (tools.length > 0) {
    items.push(
      "Use tool-first instructions where tools cover the domain; do not let agents answer from general knowledge when a configured tool should provide the answer.",
    );
  }

  if (
    tools.some((tool) => {
      const lower = `${tool.name} ${tool.purpose}`.toLowerCase();
      return (
        lower.includes("dataverse") ||
        lower.includes("list records") ||
        lower.includes("create record") ||
        lower.includes("update record") ||
        lower.includes("delete record")
      );
    })
  ) {
    items.push(
      "Prefer a small shared Dataverse CRUD connector set per agent rather than table-specific CRUD actions during pre-build unless the data model truly requires special handling.",
    );
  }

  if (agents.some((agent) => agent.knowledge.length > 0)) {
    items.push(
      "Keep knowledge sources topic-specific with explicit descriptions so retrieval and orchestration remain accurate as the solution scales.",
    );
  }

  return items;
}

function buildKnownRisks(
  agents: AgentEntry[],
  tools: ToolEntry[],
  manualSteps: string[],
): string[] {
  const items: string[] = [];

  const childOwnedMcp = tools.filter((tool) => {
    const owner = agents.find((agent) => agent.name === tool.ownerAgent);
    return tool.name.toLowerCase().includes("mcp") && owner?.type === "child";
  });
  if (childOwnedMcp.length > 0) {
    items.push(
      `Child-owned MCP tools need redesign or explicit justification: ${childOwnedMcp.map((tool) => tool.name).join(", ")}.`,
    );
  }

  if (
    tools.some((tool) => {
      const lower = `${tool.name} ${tool.purpose}`.toLowerCase();
      return lower.includes("connected agent");
    }) ||
    agents.some((agent) => agent.type === "connected")
  ) {
    items.push(
      "Connected agents have separate publishing/lifecycle requirements and their responses are summarized by the parent orchestrator.",
    );
  }

  if (
    tools.some((tool) => {
      const lower = `${tool.name} ${tool.purpose}`.toLowerCase();
      return (
        lower.includes("flow") ||
        lower.includes("power automate") ||
        lower.includes("cloud flow")
      );
    })
  ) {
    items.push(
      "Any Power Automate write or approval path must be reviewed for maker-identity implications before build proceeds.",
    );
  }

  if (
    !manualSteps.some((step) =>
      step.toLowerCase().includes("content moderation"),
    )
  ) {
    items.push(
      "Content moderation level has not yet been captured as a manual portal step and still requires an explicit decision.",
    );
  }

  return items.length > 0
    ? items
    : [
        "No immediate CPS-specific architecture exceptions identified from the current draft.",
      ];
}

function buildGeneralKnowledgeStance(tools: ToolEntry[]): string {
  if (tools.length === 0) {
    return "Use general knowledge sparingly and prefer explicit knowledge sources or deterministic topics for business-specific answers.";
  }

  return "Prefer tool-first and knowledge-first behavior. Use general knowledge only for limited clarification or conversational glue when the configured tools and knowledge sources do not already cover the request.";
}

/** Collect details for one agent */
async function collectAgent(
  agentNumber: number,
  defaults?: Partial<AgentEntry>,
): Promise<AgentEntry | undefined> {
  const name = await vscode.window.showInputBox({
    title: `Agent ${agentNumber}`,
    prompt: "Agent name",
    placeHolder: defaults?.name || "e.g. Dataverse Explorer, Billing Agent",
    value: defaults?.name,
    ignoreFocusOut: true,
  });
  if (!name) {
    return undefined;
  }

  const role = await vscode.window.showInputBox({
    prompt: `What does "${name}" do? (one sentence)`,
    placeHolder:
      defaults?.role || "e.g. Helps users find and explore Dataverse tables",
    value: defaults?.role,
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
        defaults?.instructions ||
        "e.g. Always use the MCP tool before general knowledge. Read-only, decline writes.",
      value: defaults?.instructions,
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
export function buildArchitecture(
  overview: string,
  agents: AgentEntry[],
  routingLogic: string,
  tools: ToolEntry[],
  manualSteps: string[],
): string {
  const normalizedTools = normalizeArchitectureTools(tools);
  const hasDataverseTools = tools.some((tool) => {
    const lower = `${tool.name} ${tool.purpose}`.toLowerCase();
    return (
      lower.includes("dataverse") ||
      lower.includes("list records") ||
      lower.includes("create record") ||
      lower.includes("update record") ||
      lower.includes("delete record")
    );
  });
  const appliedConstraints = buildAppliedConstraints(
    agents,
    tools,
    manualSteps,
  );
  const bestPracticeDecisions = buildBestPracticeDecisions(agents, tools);
  const knownRisks = buildKnownRisks(agents, tools, manualSteps);
  const generalKnowledgeStance = buildGeneralKnowledgeStance(tools);
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
  for (const tool of normalizedTools) {
    lines.push(
      `| ${tool.displayName} | ${tool.ownerAgent} | ${tool.purposes.join("; ")} | ${tool.manualStep ? "Yes" : "No"} |`,
    );
  }
  if (normalizedTools.length === 0) {
    lines.push("| (none defined yet) | | | |");
  }
  lines.push("");

  lines.push(
    "## Tool Descriptions",
    "",
    "<!-- Convert each tool purpose into the exact modelDescription to apply during Build. Use standard connector action names; do not rename them to business-specific labels. -->",
    "",
  );
  if (normalizedTools.length > 0) {
    for (const tool of normalizedTools) {
      const guidanceNote =
        tool.notes.length > 0 ? ` ${tool.notes.join(" ")}` : "";
      lines.push(
        `### ${tool.displayName}`,
        "",
        `${tool.purposes.join(" ")}. Call this tool when the user request clearly matches these capabilities. Do NOT use it for unrelated tasks.${guidanceNote}`,
        "",
      );
    }
  } else {
    lines.push(
      "Add exact modelDescription text for each tool here during refinement.",
      "",
    );
  }

  lines.push("## Applied CPS Constraints", "");
  appliedConstraints.forEach((item) => lines.push(`- ${item}`));
  lines.push("");

  lines.push("## Best-Practice Decisions", "");
  bestPracticeDecisions.forEach((item) => lines.push(`- ${item}`));
  lines.push("");

  lines.push("## Known Risks / Deferred Exceptions", "");
  knownRisks.forEach((item) => lines.push(`- ${item}`));
  lines.push("");

  lines.push("## General Knowledge Stance", "", generalKnowledgeStance, "");

  lines.push(
    "## Knowledge Sources",
    "",
    "| Source | Agent | Description | Type |",
    "| ------ | ----- | ----------- | ---- |",
  );
  const knowledgeRows = agents.flatMap((agent) =>
    agent.knowledge.map((source) => ({ source, agent: agent.name })),
  );
  if (knowledgeRows.length > 0) {
    for (const row of knowledgeRows) {
      lines.push(`| ${row.source} | ${row.agent} | TBD | Reference |`);
    }
  } else {
    lines.push("| (none defined yet) | | | |", "");
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

  lines.push(
    "## Autonomous Triggers",
    "",
    "| Trigger ID | Schedule | Operation | Owner Agent | Delegates To |",
    "| ---------- | -------- | --------- | ----------- | ------------ |",
    "| (none defined yet) | | | | |",
    "",
    "## Platform Constraint Validation",
    "",
    "- [ ] No triggers assigned directly to child agents",
    "- [ ] No approval workflow delegated to Power Automate without identity risk review",
    "- [ ] No MCP tool assigned to a child agent without parent-orchestration justification",
    "- [ ] Content moderation called out as portal-only if required",
    "- [ ] General knowledge stance documented explicitly",
    "- [ ] Per-agent tool count kept within practical limits",
    "",
  );

  // Build state
  lines.push(
    "## Build State",
    "",
    "- [x] Spec complete",
    "- [x] Architecture approved",
    "- [ ] Platform constraint validation passed",
    "- [ ] Agents created in portal",
    "- [ ] Tools/connectors configured (portal scaffold)",
    "- [ ] Autonomous triggers configured",
    "- [ ] Knowledge sources uploaded",
    ...(hasDataverseTools ? ["- [ ] Dataverse tables created"] : []),
    ...(hasDataverseTools ? ["- [ ] Dataverse sample data loaded"] : []),
    "- [ ] Agent instructions generated",
    "- [ ] Tool modelDescriptions generated",
    "- [ ] Topic descriptions and YAML generated",
    "- [ ] System topics customised (ConversationStart, Fallback, Escalation, OnError)",
    "- [ ] Trigger descriptions updated",
    "- [ ] Settings coherence validated",
    "- [ ] /ToolName references validated",
    "- [ ] Content moderation set in portal",
    "- [ ] Initial testing complete",
    "- [ ] Iteration complete",
    "",
  );

  return lines.join("\n");
}

/** Guided architecture creation wizard */
export async function createArchitectureGuided(
  root: string,
  seed?: {
    overview?: string;
    firstAgent?: Partial<AgentEntry>;
  },
): Promise<void> {
  const requirementsDir = path.join(root, "Requirements");
  const archPath = path.join(requirementsDir, "architecture.md");

  // Step 1: Overview
  const overview = await vscode.window.showInputBox({
    title: "CPSAgentKit: Architecture (1/5)",
    prompt: "Describe the solution in one or two sentences",
    placeHolder:
      seed?.overview ||
      "e.g. Single agent that uses MCP Dataverse Server to help users explore tables and data",
    value: seed?.overview,
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
    const agent = await collectAgent(i, i === 1 ? seed?.firstAgent : undefined);
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
    "CPSAgentKit: architecture.md created. Review and refine it, then run CPSAgentKit: Run Pre-Build. After the manual setup is complete, run Build.",
  );
}

/** Generate architecture from spec + requirements docs via Copilot Chat prompt */
export async function createArchitectureFromDocs(root: string): Promise<void> {
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

  const cpsGuidancePack = await buildCpsGuidancePack();

  const sections: string[] = [
    "You are creating a Copilot Studio agent architecture. Read the documents below and generate a complete architecture.md.",
    "Use the CPS Guidance Pack below as the authoritative repo standard for Copilot Studio-safe design decisions.",
    "Do not rely on unstated generic Copilot Studio knowledge when the guidance pack, templates, or requirements documents already cover the decision.",
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

  sections.push("", cpsGuidancePack);

  sections.push(
    "",
    "## Instructions",
    "",
    "- Decide how many agents are needed based on the spec and requirements",
    "- Normalize the architecture into a CPS-compliant shape using the bundled repo guidance rather than generic defaults",
    "- For each agent, specify its role, type (standalone/parent/child/connected), tools, and knowledge sources",
    "- Define routing logic if there are multiple agents",
    "- List all tools and connectors with their owner agent and purpose",
    "- Normalize business capabilities into shared standard connector actions where applicable; do not invent function-specific connector names when a standard action should be reused",
    `- Prefer standard action names from this curated connector set when they fit: ${CURATED_CONNECTOR_CATALOG.map((entry) => entry.connectorName).join(", ")}`,
    "- In the Tools & Connectors section, name recognized standard actions as 'Connector Name - Action Name' (for example: 'Microsoft Dataverse - List rows from selected environment')",
    "- Add a Tool Descriptions section with exact modelDescription text for every tool, not placeholders",
    "- In Tool Descriptions, keep standard connector action names unchanged and describe when to call them rather than renaming them to business functions",
    "- Add Applied CPS Constraints, Best-Practice Decisions, Known Risks / Deferred Exceptions, and General Knowledge Stance sections with concrete project-specific content",
    "- Add an Autonomous Triggers table if the solution uses proactive operations",
    "- Identify any manual portal steps required",
    "- Validate platform constraints before finalising: child agents cannot own triggers, Power Automate approval flows have run-as-author governance implications, MCP tools on child agents need explicit parent orchestration justification, content moderation must be listed as a manual portal step, and the general-knowledge stance must be explicit",
    "- If the first draft violates a known Copilot Studio platform constraint, rewrite it into a compliant architecture instead of preserving the invalid design",
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
