import * as fs from "fs/promises";
import * as path from "path";
import { readMarkdownFiles, fileExists } from "./fileUtils.js";
import { CURRENT_VERSION } from "./config.js";

/** Result of checking Dataverse MCP configuration in the workspace */
export interface DataverseMcpStatus {
  configured: boolean;
  serverName?: string;
  url?: string;
}

/** Parsed agent entry from architecture.md */
interface ArchAgent {
  name: string;
  role: string;
  type: string;
  tools: string[];
  knowledgeSources: string[];
  instructions: string;
}

/** Parsed tool entry from architecture.md */
interface ArchTool {
  name: string;
  ownerAgent: string;
  purpose: string;
  manualStep: boolean;
}

/** Parsed knowledge source from architecture.md */
interface ArchKnowledge {
  source: string;
  agent: string;
  description: string;
  type: string;
}

/** Parse ## Agents section from architecture.md */
function parseAgents(content: string): ArchAgent[] {
  const agents: ArchAgent[] = [];
  const agentSection = extractSection(content, "Agents");
  if (!agentSection) {
    return agents;
  }

  // Split by ### headings
  const agentBlocks = agentSection.split(/^### /m).filter((b) => b.trim());
  for (const block of agentBlocks) {
    const lines = block.split("\n");
    const name = lines[0].trim();
    if (!name) {
      continue;
    }

    let role = "";
    let type = "";
    const tools: string[] = [];
    const knowledgeSources: string[] = [];
    let instructions = "";

    for (const line of lines) {
      const trimmed = line.trim();
      const roleMatch = trimmed.match(/^\*\*Role:\*\*\s*(.+)/);
      if (roleMatch) {
        role = roleMatch[1];
      }
      const typeMatch = trimmed.match(/^\*\*Type:\*\*\s*(.+)/);
      if (typeMatch) {
        type = typeMatch[1];
      }
      const toolsMatch = trimmed.match(/^\*\*Tools:\*\*\s*(.+)/);
      if (toolsMatch && toolsMatch[1].toLowerCase() !== "none") {
        tools.push(
          ...toolsMatch[1]
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        );
      }
      const ksMatch = trimmed.match(/^\*\*Knowledge sources:\*\*\s*(.+)/);
      if (ksMatch && ksMatch[1].toLowerCase() !== "none") {
        knowledgeSources.push(
          ...ksMatch[1]
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        );
      }
      const instrMatch = trimmed.match(/^\*\*Key instructions:\*\*\s*(.+)/);
      if (instrMatch) {
        instructions = instrMatch[1];
      }
    }

    agents.push({ name, role, type, tools, knowledgeSources, instructions });
  }

  return agents;
}

/** Parse ## Tools & Connectors table from architecture.md */
function parseTools(content: string): ArchTool[] {
  const tools: ArchTool[] = [];
  const section = extractSection(content, "Tools & Connectors");
  if (!section) {
    return tools;
  }

  const lines = section.split("\n");
  for (const line of lines) {
    // Match table row: | name | owner | purpose | Yes/No |
    const match = line.match(
      /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/,
    );
    if (!match) {
      continue;
    }
    const [, name, owner, purpose, manual] = match;
    // Skip header and separator rows
    if (name.startsWith("-") || name.toLowerCase().includes("tool")) {
      continue;
    }
    if (name.includes("none defined")) {
      continue;
    }
    tools.push({
      name: name.trim(),
      ownerAgent: owner.trim(),
      purpose: purpose.trim(),
      manualStep: manual.trim().toLowerCase() === "yes",
    });
  }

  return tools;
}

/** Parse ## Knowledge Sources table from architecture.md */
function parseKnowledgeSources(content: string): ArchKnowledge[] {
  const sources: ArchKnowledge[] = [];
  const section = extractSection(content, "Knowledge Sources");
  if (!section) {
    return sources;
  }

  const lines = section.split("\n");
  for (const line of lines) {
    const match = line.match(
      /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/,
    );
    if (!match) {
      continue;
    }
    const [, source, agent, description, type] = match;
    if (source.startsWith("-") || source.toLowerCase().includes("source")) {
      continue;
    }
    if (!source.trim()) {
      continue;
    }
    sources.push({
      source: source.trim(),
      agent: agent.trim(),
      description: description.trim(),
      type: type.trim(),
    });
  }

  return sources;
}

/** Parse ## Manual Portal Steps from architecture.md */
function parseManualSteps(content: string): string[] {
  const section = extractSection(content, "Manual Portal Steps");
  if (!section) {
    return [];
  }

  const steps: string[] = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^\d+\.\s+(.+)/);
    if (match && match[1].trim()) {
      steps.push(match[1].trim());
    }
  }
  return steps;
}

/** Extract a ## section from markdown (up to next ## or end) */
function extractSection(content: string, heading: string): string | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `^## ${escapedHeading}\\s*$([\\s\\S]*?)(?=^## |$)`,
    "m",
  );
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

/** Detect if a tool is likely Dataverse-related */
function isDataverseTool(tool: ArchTool): boolean {
  const lower = (tool.name + " " + tool.purpose).toLowerCase();
  return (
    lower.includes("dataverse") ||
    lower.includes("list records") ||
    lower.includes("create record") ||
    lower.includes("update record") ||
    lower.includes("delete record")
  );
}

/** Detect if a tool is likely MCP-based */
function isMcpTool(tool: ArchTool): boolean {
  const lower = (tool.name + " " + tool.purpose).toLowerCase();
  return lower.includes("mcp");
}

/** Detect if a tool is likely a Power Automate flow */
function isFlowTool(tool: ArchTool): boolean {
  const lower = (tool.name + " " + tool.purpose).toLowerCase();
  return (
    lower.includes("flow") ||
    lower.includes("power automate") ||
    lower.includes("cloud flow")
  );
}

/** Detect if a knowledge source is SharePoint-based */
function isSharePointSource(ks: ArchKnowledge): boolean {
  const lower = (
    ks.source +
    " " +
    ks.description +
    " " +
    ks.type
  ).toLowerCase();
  return lower.includes("sharepoint");
}

/** Build the Dataverse table creation prompt for GHCP Agent mode with Dataverse MCP */
function buildDataversePrompt(
  tools: ArchTool[],
  spec: string,
  mcpStatus: DataverseMcpStatus,
): string {
  const dvTools = tools.filter(isDataverseTool);
  if (dvTools.length === 0) {
    return "";
  }

  const toolList = dvTools
    .map((t) => `- **${t.name}** (${t.ownerAgent}): ${t.purpose}`)
    .join("\n");

  const sections: string[] = [];

  sections.push("### Dataverse Tables — GitHub Copilot Agent Mode", "");

  if (!mcpStatus.configured) {
    sections.push(
      "> ⚠️ **Dataverse MCP is not configured in this workspace.** The prompt below requires the Dataverse MCP server connected to GitHub Copilot in Agent mode.",
      "> Follow the setup guide in `.cpsagentkit/knowledge/dataverse-mcp-setup.md`, then re-run this checklist.",
      "",
    );
  } else {
    sections.push(
      `> ✅ Dataverse MCP detected: **${mcpStatus.serverName}** → \`${mcpStatus.url}\``,
      "",
    );
  }

  sections.push(
    "Open GitHub Copilot Chat in **Agent mode**, ensure the Dataverse MCP tools are visible (click the wrench icon), then paste:",
    "",
    "```",
    "I need you to create Dataverse tables for a Copilot Studio agent using the Dataverse MCP tools.",
    "",
    "Agent purpose:",
    extractPurpose(spec),
    "",
    "The following tools/connectors will interact with Dataverse:",
    toolList,
    "",
    "Create the tables and columns needed to support these tools.",
    "Use appropriate column types (Choice for enums, Lookup for relationships, Currency for money, etc.).",
    "Add a Status column with sensible choices where applicable.",
    'Use singular table names (e.g. "Case" not "Cases").',
    "After creating each table, run describe_table to confirm the schema is correct.",
    "```",
    "",
  );

  return sections.join("\n");
}

/** Extract the Purpose section from spec.md */
function extractPurpose(spec: string): string {
  const section = extractSection(spec, "Purpose");
  if (
    section &&
    section !== "<!-- One paragraph: what does this agent do and why? -->"
  ) {
    return section
      .split("\n")
      .filter((l) => !l.startsWith("<!--"))
      .join("\n")
      .trim();
  }
  // Fall back to first non-heading, non-comment line
  for (const line of spec.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("<!--")) {
      return trimmed;
    }
  }
  return "(see spec.md)";
}

/**
 * Build a plain-text Dataverse table creation prompt suitable for
 * pasting directly into GHCP Agent mode. Returns empty string if no
 * Dataverse tools exist in the architecture.
 */
export function composeDataverseChatPrompt(
  spec: string,
  architecture: string,
): string {
  const tools = parseTools(architecture);
  const dvTools = tools.filter(isDataverseTool);
  if (dvTools.length === 0) {
    return "";
  }

  const toolList = dvTools
    .map((t) => `- ${t.name} (${t.ownerAgent}): ${t.purpose}`)
    .join("\n");

  return [
    "I need you to create Dataverse tables for a Copilot Studio agent using the Dataverse MCP tools.",
    "",
    "Agent purpose:",
    extractPurpose(spec),
    "",
    "The following tools/connectors will interact with Dataverse:",
    toolList,
    "",
    "Create the tables and columns needed to support these tools.",
    "Use appropriate column types (Choice for enums, Lookup for relationships, Currency for money, etc.).",
    "Add a Status column with sensible choices where applicable.",
    'Use singular table names (e.g. "Case" not "Cases").',
    "After creating each table, run describe_table to confirm the schema is correct.",
  ].join("\n");
}

/** Compose the full pre-build checklist document */
export function composePreBuildChecklist(
  spec: string,
  architecture: string,
  requirementsDocs: Array<{ filename: string; content: string }>,
  mcpStatus: DataverseMcpStatus,
): string {
  const agents = parseAgents(architecture);
  const tools = parseTools(architecture);
  const knowledgeSources = parseKnowledgeSources(architecture);
  const manualSteps = parseManualSteps(architecture);

  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");

  const sections: string[] = [];

  // --- Header ---
  sections.push(
    "# Pre-Build Checklist",
    "",
    `**Generated**: ${timestamp}`,
    `**CPSAgentKit version**: ${CURRENT_VERSION}`,
    "",
    "This checklist covers everything that needs to be created in the Copilot Studio portal (and related services) **before** building agent logic. Create these as scaffolds — blank agents, tools added but not configured, knowledge sources attached but not populated.",
    "",
    "Work through each section in order. Tick items off as you go.",
    "",
  );

  // --- Prerequisites ---
  const hasDataverseTools = tools.some(isDataverseTool);
  if (hasDataverseTools) {
    sections.push("## 0. Prerequisites", "");
    sections.push(
      "Your architecture includes Dataverse tools. GitHub Copilot needs the Dataverse MCP server to create tables directly from this workspace.",
      "",
    );
    if (mcpStatus.configured) {
      sections.push(
        `- [x] Dataverse MCP configured: **${mcpStatus.serverName}** → \`${mcpStatus.url}\``,
        "",
      );
    } else {
      sections.push(
        "- [ ] **Connect Dataverse MCP to GitHub Copilot** — follow the guide in `.cpsagentkit/knowledge/dataverse-mcp-setup.md`",
        "",
        "  Quick summary:",
        "  1. Create a **Managed Environment** with Dataverse at [make.powerapps.com](https://make.powerapps.com)",
        "  2. Enable **Dataverse Model Context Protocol** in Power Platform admin center → Settings → Product → Features",
        "  3. Allow the **GitHub Copilot** client in Advanced Settings → Active Allowed MCP Clients",
        "  4. Get your **Instance URL** from make.powerapps.com → Settings → Session details",
        "  5. In VS Code: **Cmd+Shift+P** → `MCP: Add Server` → HTTP → paste `https://<your-org>.crm.dynamics.com/api/mcp`",
        "  6. Click **Start** in `.vscode/mcp.json` and authenticate",
        "",
      );
    }
  }

  // --- 1. Agents ---
  sections.push("## 1. Create Agents", "");
  if (agents.length === 0) {
    sections.push(
      "No agents found in architecture.md. Create the architecture first.",
      "",
    );
  } else {
    sections.push(
      "Create each agent in the Copilot Studio portal. Leave instructions blank for now — we'll generate those in the Build phase.",
      "",
    );

    // Determine creation order: parent/router first, then children, then connected
    const sorted = [...agents].sort((a, b) => {
      const order: Record<string, number> = {
        parent: 0,
        "parent (router)": 0,
        standalone: 1,
        child: 2,
        "child agent": 2,
        connected: 3,
        "connected agent": 3,
      };
      return (
        (order[a.type.toLowerCase()] ?? 1) - (order[b.type.toLowerCase()] ?? 1)
      );
    });

    for (const agent of sorted) {
      const isParent = agent.type.toLowerCase().includes("parent");
      const isChild = agent.type.toLowerCase().includes("child");
      const isConnected = agent.type.toLowerCase().includes("connected");

      sections.push(`### ${agent.name}`);
      sections.push("");
      sections.push(`- [ ] Create agent in portal`);
      sections.push(`  - **Name**: ${agent.name}`);
      sections.push(`  - **Type**: ${agent.type}`);
      if (agent.role) {
        sections.push(`  - **Description**: ${agent.role}`);
      }
      sections.push(`  - **Orchestration**: Generative`);
      sections.push(
        `  - **Instructions**: Leave blank (generated in Build phase)`,
      );

      if (isParent && agents.length > 1) {
        const children = agents.filter(
          (a) =>
            a.type.toLowerCase().includes("child") ||
            a.type.toLowerCase().includes("connected"),
        );
        if (children.length > 0) {
          sections.push(
            `- [ ] Add child/connected agents after they are created:`,
          );
          for (const child of children) {
            sections.push(`  - ${child.name} (${child.type})`);
          }
        }
      }

      if (isChild) {
        sections.push(
          `- [ ] Attach as child to parent agent once parent exists`,
        );
      }
      if (isConnected) {
        sections.push(
          `- [ ] Publish agent, then add as connected agent to parent`,
        );
      }

      sections.push("");
    }
  }

  // --- 2. Tools & Connectors ---
  sections.push("## 2. Add Tools & Connectors", "");
  if (tools.length === 0) {
    sections.push("No tools found in architecture.md.", "");
  } else {
    sections.push(
      "Add each tool to its owner agent. Configure connection references but leave descriptions for the Build phase.",
      "",
    );

    const mcpTools = tools.filter(isMcpTool);
    const flowTools = tools.filter(isFlowTool);
    const dvTools = tools.filter(isDataverseTool);
    const otherTools = tools.filter(
      (t) => !isMcpTool(t) && !isFlowTool(t) && !isDataverseTool(t),
    );

    if (mcpTools.length > 0) {
      sections.push("### MCP Tools", "");
      for (const tool of mcpTools) {
        sections.push(`- [ ] **${tool.name}** → ${tool.ownerAgent}`);
        sections.push(`  - Purpose: ${tool.purpose}`);
        sections.push(`  - Add MCP server connection in agent's Tools page`);
        sections.push(`  - Set transport: Streamable HTTP`);
        sections.push(
          `  - Enter server URL (leave placeholder if not yet deployed)`,
        );
        sections.push("");
      }
      sections.push(
        "> **Note**: MCP tools on child agents are NOT invoked via parent orchestration. If the parent needs MCP results, the parent should own the MCP tool.",
        "",
      );
    }

    if (flowTools.length > 0) {
      sections.push("### Power Automate Flows", "");
      for (const tool of flowTools) {
        sections.push(`- [ ] **${tool.name}** → ${tool.ownerAgent}`);
        sections.push(`  - Purpose: ${tool.purpose}`);
        sections.push(`  - Create cloud flow in Power Automate`);
        sections.push(`  - Add trigger: "Run a flow from Copilot"`);
        sections.push(`  - Add "Return value(s) to Copilot Studio" step`);
        sections.push(`  - Connect to agent via Tools page`);
        sections.push("");
      }
    }

    if (dvTools.length > 0) {
      sections.push("### Dataverse Connectors", "");
      for (const tool of dvTools) {
        sections.push(`- [ ] **${tool.name}** → ${tool.ownerAgent}`);
        sections.push(`  - Purpose: ${tool.purpose}`);
        sections.push(`  - Add Dataverse connector action to agent`);
        sections.push(`  - Select table (create tables first — see Section 5)`);
        sections.push("");
      }
    }

    if (otherTools.length > 0) {
      sections.push("### Other Tools", "");
      for (const tool of otherTools) {
        sections.push(`- [ ] **${tool.name}** → ${tool.ownerAgent}`);
        sections.push(`  - Purpose: ${tool.purpose}`);
        if (tool.manualStep) {
          sections.push(`  - ⚠️ Requires manual portal setup`);
        }
        sections.push("");
      }
    }
  }

  // --- 3. Knowledge Sources ---
  sections.push("## 3. Attach Knowledge Sources", "");
  if (knowledgeSources.length === 0) {
    // Check agents for knowledge too
    const agentKs = agents.flatMap((a) =>
      a.knowledgeSources.map((ks) => ({ source: ks, agent: a.name })),
    );
    if (agentKs.length === 0) {
      sections.push("No knowledge sources found in architecture.md.", "");
    } else {
      sections.push(
        "Add each knowledge source to its agent. Content can be populated later.",
        "",
      );
      for (const ks of agentKs) {
        sections.push(`- [ ] **${ks.source}** → ${ks.agent}`);
        sections.push("");
      }
    }
  } else {
    sections.push(
      "Add each knowledge source to its agent. Content can be populated later.",
      "",
    );
    for (const ks of knowledgeSources) {
      sections.push(`- [ ] **${ks.source}** → ${ks.agent}`);
      sections.push(`  - Type: ${ks.type}`);
      sections.push(`  - ${ks.description}`);
      if (isSharePointSource(ks)) {
        sections.push(
          `  - ⚠️ Ensure modern pages only, no classic ASPX. Check 7 MB limit without M365 Copilot license.`,
        );
      }
      sections.push("");
    }
  }

  // --- 4. Manual Portal Steps ---
  sections.push("## 4. Manual Portal Steps", "");
  if (manualSteps.length === 0) {
    sections.push("No additional manual steps listed in architecture.md.", "");
  } else {
    sections.push(
      "These steps were identified in the architecture as requiring manual portal work.",
      "",
    );
    for (const step of manualSteps) {
      sections.push(`- [ ] ${step}`);
    }
    sections.push("");
  }

  // --- 5. Automation Prompts ---
  sections.push(
    "---",
    "",
    "# Automation Prompts",
    "",
    "Use these prompts to automate parts of the scaffold. Each prompt targets the right tool for the job.",
    "",
  );

  // 5a. Dataverse tables via GHCP Agent mode with Dataverse MCP
  const dvPrompt = buildDataversePrompt(tools, spec, mcpStatus);
  if (dvPrompt) {
    sections.push(dvPrompt);
  }

  // 5b. GHCP prompts for things Copilot can help with
  sections.push("### GitHub Copilot Chat Prompts", "");
  sections.push(
    "Paste these into GitHub Copilot Chat to generate configuration you can apply to your agents.",
    "",
  );

  // Agent descriptions prompt
  if (agents.length > 0) {
    sections.push("#### Generate Agent Descriptions", "");
    sections.push("```");
    sections.push(
      "Read Requirements/spec.md and Requirements/architecture.md.",
    );
    sections.push(
      "For each agent listed in the architecture, write a one-paragraph agent description",
    );
    sections.push(
      "suitable for pasting into the Copilot Studio portal Overview page.",
    );
    sections.push(
      "The description should tell the orchestrator exactly when to route to this agent.",
    );
    sections.push(
      "Follow the patterns in .cpsagentkit/knowledge/tool-descriptions.md.",
    );
    sections.push("```");
    sections.push("");
  }

  // Topic scaffolding prompt
  if (agents.length > 0) {
    sections.push("#### Scaffold Topics", "");
    sections.push("```");
    sections.push(
      "Read Requirements/spec.md and Requirements/architecture.md.",
    );
    sections.push(
      "For each agent, list the topics that should be created and write a",
    );
    sections.push("trigger description for each topic. Topics should cover:");
    sections.push("- The core capabilities listed in the spec");
    sections.push("- A ConversationStart greeting topic");
    sections.push("- An escalation/fallback topic");
    sections.push(
      "Format as a table: Agent | Topic Name | Trigger Description",
    );
    sections.push("```");
    sections.push("");
  }

  // Connection references prompt
  const toolsNeedingConnections = tools.filter(
    (t) => isFlowTool(t) || isDataverseTool(t),
  );
  if (toolsNeedingConnections.length > 0) {
    sections.push("#### Generate Connection References", "");
    sections.push("```");
    sections.push(
      "Read Requirements/architecture.md and list all Power Platform",
    );
    sections.push("connection references needed for the tools and connectors.");
    sections.push(
      "For each, specify: connection name, connector type, and which agent uses it.",
    );
    sections.push("```");
    sections.push("");
  }

  // --- 6. How-To Reference ---
  sections.push(
    "---",
    "",
    "# How-To Reference",
    "",
    "Quick instructions for each type of portal action above.",
    "",
  );

  sections.push(
    "## Creating an Agent",
    "",
    "1. Go to [Copilot Studio](https://copilotstudio.microsoft.com/)",
    "2. Click **Create** → **New agent**",
    "3. Set the name and description from the checklist above",
    "4. Set orchestration to **Generative**",
    "5. Leave instructions blank — these are generated in the Build phase",
    "6. For child agents: create them first, then add to the parent via **Settings → Agent Transfers**",
    "7. For connected agents: publish the agent first, then add to parent",
    "",
  );

  sections.push(
    "## Adding an MCP Tool",
    "",
    "1. Open the agent in Copilot Studio",
    "2. Go to **Tools** → **Add a tool**",
    "3. Select **MCP** → **Streamable HTTP**",
    "4. Enter the MCP server URL",
    "5. The agent will discover available tools from the server",
    "6. Ensure the parent agent owns MCP tools if child agents need the results",
    "",
  );

  sections.push(
    "## Adding a Power Automate Flow",
    "",
    "1. Create the flow in [Power Automate](https://make.powerautomate.com/)",
    '2. Use trigger: **"Run a flow from Copilot"**',
    "3. Define input parameters the agent will provide",
    '4. Add a **"Return value(s) to Copilot Studio"** step before the end',
    "5. Place any slow/async work AFTER the return step (100s timeout)",
    "6. In CPS: **Tools** → **Add a tool** → select the flow",
    "",
  );

  sections.push(
    "## Adding a Dataverse Connector",
    "",
    "1. Open the agent in Copilot Studio",
    "2. Go to **Tools** → **Add a tool**",
    "3. Search for the Dataverse connector action (e.g. List rows)",
    "4. Select the table and configure the connection",
    "5. Use exact schema-name fields in descriptions (e.g. `cr86a_fieldname`)",
    "",
  );

  sections.push(
    "## Adding Knowledge Sources",
    "",
    "1. Open the agent in Copilot Studio",
    "2. Go to **Knowledge** → **Add knowledge**",
    "3. Select the source type (SharePoint, files, Dataverse, etc.)",
    "4. For SharePoint: use modern pages only, check the 7 MB limit",
    "5. Write a clear description — at >25 sources, descriptions drive search filtering",
    "6. Allow 5-30 minutes for indexing after enabling",
    "",
  );

  sections.push(
    "## Creating Dataverse Tables",
    "",
    "Tables are created via **GitHub Copilot in Agent mode** using the Dataverse MCP server.",
    "",
    "1. Ensure Dataverse MCP is configured (see Prerequisites / `.cpsagentkit/knowledge/dataverse-mcp-setup.md`)",
    "2. Open GitHub Copilot Chat → switch to **Agent mode**",
    "3. Click the **tools icon** (wrench) and confirm Dataverse MCP tools are listed",
    "4. Paste the Dataverse prompt from the Automation Prompts section above",
    "5. Review the created tables — ask Copilot to `describe_table` each one",
    "6. Return to CPS and connect the Dataverse tools to the new tables",
    "",
  );

  return sections.join("\n");
}

/** Read spec and architecture, returning their content or empty strings */
export async function readRequirements(workspaceRoot: string): Promise<{
  spec: string;
  architecture: string;
  docs: Array<{ filename: string; content: string }>;
}> {
  const reqDir = path.join(workspaceRoot, "Requirements");
  let spec = "";
  let architecture = "";
  try {
    spec = await fs.readFile(path.join(reqDir, "spec.md"), "utf-8");
  } catch {
    /* no spec */
  }
  try {
    architecture = await fs.readFile(
      path.join(reqDir, "architecture.md"),
      "utf-8",
    );
  } catch {
    /* no architecture */
  }
  const docs = await readMarkdownFiles(path.join(reqDir, "docs"));
  return { spec, architecture, docs };
}

/**
 * Detect whether a Dataverse MCP server is configured in the workspace.
 * Checks .vscode/mcp.json for any server with a dynamics.com/api/mcp URL.
 */
export async function detectDataverseMcp(
  workspaceRoot: string,
): Promise<DataverseMcpStatus> {
  const mcpJsonPath = path.join(workspaceRoot, ".vscode", "mcp.json");
  try {
    const raw = await fs.readFile(mcpJsonPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { configured: false };
    }
    const obj = parsed as Record<string, unknown>;
    const servers = obj.servers;
    if (
      typeof servers !== "object" ||
      servers === null ||
      Array.isArray(servers)
    ) {
      return { configured: false };
    }
    const serversObj = servers as Record<string, unknown>;
    for (const [name, config] of Object.entries(serversObj)) {
      if (typeof config !== "object" || config === null) {
        continue;
      }
      const serverConfig = config as Record<string, unknown>;
      const url = String(serverConfig.url ?? "");
      if (
        url.includes("dynamics.com/api/mcp") ||
        (url.includes("crm") && url.includes("/api/mcp"))
      ) {
        return { configured: true, serverName: name, url };
      }
    }
    return { configured: false };
  } catch {
    return { configured: false };
  }
}
