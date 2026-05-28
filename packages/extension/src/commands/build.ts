import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import {
  openPromptInCopilotChat,
  requireWorkspaceRoot,
} from "../ui/uiUtils.js";
import {
  LABEL_PLATFORM_CONSTRAINT_VALIDATION,
  LABEL_AGENTS_CREATED,
  LABEL_TOOLS_CONFIGURED,
  LABEL_AUTONOMOUS_TRIGGERS,
  LABEL_KNOWLEDGE_SOURCES,
  LABEL_DATAVERSE_TABLES,
  LABEL_DATAVERSE_SAMPLE_DATA,
  LABEL_AGENT_INSTRUCTIONS,
  LABEL_TOOL_DESCRIPTIONS,
  LABEL_TOPIC_DESCRIPTIONS,
  LABEL_SYSTEM_TOPICS,
  LABEL_TRIGGER_DESCRIPTIONS,
  LABEL_SETTINGS_COHERENCE,
  LABEL_TOOLNAME_REFERENCES,
  LABEL_CONTENT_MODERATION,
  LABEL_INITIAL_TESTING,
  LABEL_ITERATION_COMPLETE,
} from "../constants/buildStateLabels.js";

/** Parse build state checkboxes from architecture.md */
async function parseBuildState(
  archPath: string,
): Promise<Array<{ label: string; done: boolean; line: number }>> {
  const content = await fs.readFile(archPath, "utf-8");
  const lines = content.split("\n");
  const items: Array<{ label: string; done: boolean; line: number }> = [];

  let inBuildState = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "## Build State") {
      inBuildState = true;
      continue;
    }
    if (inBuildState && lines[i].startsWith("## ")) {
      break;
    }
    if (inBuildState) {
      const match = lines[i].match(/^- \[([ x])\] (.+)$/);
      if (match) {
        items.push({ label: match[2], done: match[1] === "x", line: i });
      }
    }
  }
  return items;
}

/** Update build state in architecture.md — toggle a specific item */
async function updateBuildState(
  archPath: string,
  lineNumber: number,
  done: boolean,
): Promise<void> {
  const content = await fs.readFile(archPath, "utf-8");
  const lines = content.split("\n");
  const checkbox = done ? "[x]" : "[ ]";
  lines[lineNumber] = lines[lineNumber].replace(/\[[ x]\]/, checkbox);
  await fs.writeFile(archPath, lines.join("\n"), "utf-8");
}

async function readSpecAndArchitecture(root: string): Promise<{
  spec: string;
  architecture: string;
}> {
  let spec = "";
  let architecture = "";

  try {
    spec = await fs.readFile(
      path.join(root, "Requirements", "spec.md"),
      "utf-8",
    );
  } catch {
    // Best-effort guidance only
  }

  try {
    architecture = await fs.readFile(
      path.join(root, "Requirements", "architecture.md"),
      "utf-8",
    );
  } catch {
    // Best-effort guidance only
  }

  return { spec, architecture };
}

/** Build checklist command — shows current state and lets user drive the build */
export async function buildCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }
  const archPath = path.join(root, "Requirements", "architecture.md");
  const checklistPath = path.join(root, "Requirements", "build-checklist.md");

  // Require architecture.md
  try {
    await fs.access(archPath);
  } catch {
    try {
      await fs.access(checklistPath);
      const doc = await vscode.workspace.openTextDocument(checklistPath);
      await vscode.window.showTextDocument(doc, { preview: true });
      vscode.window.showInformationMessage(
        "Agent Workbench: Opened build-checklist.md. Complete the checklist, then run Build Agent again.",
      );
      return;
    } catch {
      // Fall through to the Create Plan prompt below.
    }

    const action = await vscode.window.showWarningMessage(
      "Agent Workbench: Requirements/architecture.md not found. Create specification first?",
      "Create Plan",
      "Cancel",
    );
    if (action === "Create Plan") {
      await vscode.commands.executeCommand("agentWorkbench.createSpec");
    }
    return;
  }

  // Parse current build state
  const items = await parseBuildState(archPath);
  if (items.length === 0) {
    vscode.window.showWarningMessage(
      "Agent Workbench: No build state checklist found in architecture.md.",
    );
    return;
  }

  // Show QuickPick with current state
  const picks = items.map((item) => ({
    label: `${item.done ? "$(check)" : "$(circle-outline)"} ${item.label}`,
    description: item.done ? "Done" : "Not started",
    item,
  }));

  const selected = await vscode.window.showQuickPick(picks, {
    title: "Agent Workbench: Build Checklist",
    placeHolder: "Select a step to mark complete or get guidance",
    ignoreFocusOut: true,
  });

  if (!selected) {
    return;
  }

  const { item } = selected;

  if (item.done) {
    // Offer to uncheck
    const undo = await vscode.window.showQuickPick(
      ["Mark as not done", "Cancel"],
      {
        placeHolder: `"${item.label}" is complete. Undo?`,
      },
    );
    if (undo === "Mark as not done") {
      await updateBuildState(archPath, item.line, false);
      vscode.window.showInformationMessage(
        `Agent Workbench: "${item.label}" marked as not done.`,
      );
    }
    return;
  }

  // For incomplete items, offer guidance or mark done
  const action = await vscode.window.showQuickPick(
    [
      { label: "$(check) Mark as done", detail: "mark" },
      { label: "$(comment) Get Copilot help", detail: "help" },
      { label: "$(file) Open architecture.md", detail: "open" },
    ],
    {
      placeHolder: `"${item.label}" — what would you like to do?`,
      ignoreFocusOut: true,
    },
  );

  if (!action) {
    return;
  }

  switch (action.detail) {
    case "mark":
      await updateBuildState(archPath, item.line, true);
      vscode.window.showInformationMessage(
        `Agent Workbench: "${item.label}" marked as done.`,
      );
      break;
    case "help": {
      // Build a Copilot-ready prompt and load it into GitHub Copilot Chat
      const { spec, architecture } = await readSpecAndArchitecture(root);
      const prompt = buildGuidancePrompt(item.label, spec, architecture);
      await openPromptInCopilotChat(prompt);
      vscode.window.showInformationMessage(
        `Agent Workbench: Guidance prompt for "${item.label}" loaded into GitHub Copilot Chat. Press Enter to submit.`,
      );
      break;
    }
    case "open": {
      const doc = await vscode.workspace.openTextDocument(archPath);
      await vscode.window.showTextDocument(doc);
      break;
    }
  }
}

/** Generate a targeted Copilot prompt for a specific build step */
function buildGuidancePrompt(
  stepLabel: string,
  spec: string,
  architecture: string,
): string {
  const prompts: Record<string, string> = {
    [LABEL_PLATFORM_CONSTRAINT_VALIDATION]: [
      "Read architecture.md and review the Platform Constraint Validation section.",
      "Check each constraint against the CPS platform constraints in .agent-workbench/knowledge/constraints.md.",
      "Verify: no triggers on child agents, no MCP tools on child agents without justification,",
      "content moderation flagged as portal-only if needed, general knowledge stance documented,",
      "per-agent tool count within 25-30 practical limit.",
      "Report any violations and suggest fixes.",
    ].join("\n"),
    [LABEL_AGENTS_CREATED]: [
      "Read architecture.md and classify each agent as existing YAML, guarded manual child scaffold, or portal-first creation.",
      "For simple instruction-only child agents with no tools, connector bindings, MCP servers, knowledge sources, prompt tools, flows, custom auth, or portal-only settings, you may scaffold locally under `agents/<SafeFolderName>/agent.mcs.yml` using `kind: AgentDialog`, `beginDialog.kind: OnToolSelected`, a strong routing description, and `settings.instructions`.",
      "For parent agents, connected agents, and child agents needing tools/knowledge/connectors/MCP/prompt tools/flows or portal-only settings, list the exact Copilot Studio portal steps.",
      "For each agent, specify: name, creation path, routing description, instructions location, settings to configure, validation checks, and whether Apply Changes plus portal acceptance is required.",
      "If an agent already exists in the workspace (YAML files), note what needs updating vs creating fresh.",
    ].join("\n"),
    [LABEL_TOOLS_CONFIGURED]: [
      "Read architecture.md and for each tool/connector listed:",
      "1. Classify the creation path as existing YAML, portal-first, or explicitly approved experimental manual YAML scaffold.",
      "2. Write the exact tool DESCRIPTION that should be set in the CPS portal or action YAML (following tool-descriptions.md patterns).",
      "3. List the input parameters with human-readable names and format descriptions.",
      "4. Note if it requires manual portal setup (MCP server connection, Power Automate flow, etc.).",
      "5. For experimental manual action scaffolds, require root `connectionreferences.mcs.yml`, matching `action.connectionReference`, portal/export-style `operationId`, Apply Changes, Get Changes round-trip, and Activity Map runtime testing before marking complete.",
      "6. For MCP tools, validate runtime-discovered subtools separately from action YAML and portal-enabled status. Do not edit `knownTools` or `operationDetails`; if subtools are missing, instruct the maker to follow the four-step Save sequence (disable tool + Save, disable subtools + Save, enable tool + Save, refresh tools + Save) and retest in Activity Map.",
      "7. Validate every `/ToolName` reference against exact action YAML `modelDisplayName` values after Get Changes.",
      "CRITICAL: If the agent has tools (MCP, connectors, flows), the agent instructions MUST say:",
      '"Always use [tool name] to answer questions. Do not use general knowledge when the tool can provide the answer."',
    ].join("\n"),
    [LABEL_AUTONOMOUS_TRIGGERS]: [
      "Read architecture.md and the Autonomous Triggers table.",
      "For each trigger: specify the schedule or event, the operation it performs, which agent owns it,",
      "and which child agent (if any) it delegates to.",
      "CRITICAL: Triggers can only be owned by top-level (parent) agents — child agents cannot own triggers.",
      "Verify trigger security: limit tool invocations, constrain parameters, and check knowledge sources before acting.",
    ].join("\n"),
    [LABEL_KNOWLEDGE_SOURCES]: [
      "Read architecture.md and for each knowledge source:",
      "1. Write the exact knowledge source DESCRIPTION (following knowledge-sources.md patterns).",
      "2. Specify the source type (SharePoint, uploaded file, connector, etc.) and owner agent/child agent.",
      "3. Classify the creation path as existing YAML, manual portal action, or programmatic uploaded-file knowledge via Dataverse/CPS Web API.",
      "4. For uploaded files, never generate local knowledge YAML as the ingestion mechanism. If tenant-aligned API auth is available from `.mcs/conn.json`, create a `botcomponent` row with `componenttype = 14`, upload file bytes to `filedata`, confirm Ready, run Get Changes, verify the local descriptor, and test Activity Map retrieval. If not available, stop and list a manual portal upload step.",
      "5. Tenant/auth check: derive Dataverse endpoint and TenantId from `.mcs/conn.json`; if auth returns 403 user-not-member, report wrong-tenant auth rather than a schema/upload failure.",
      "6. Note any file size limits, tenant/auth requirements, or permission requirements.",
      "7. If >25 sources exist, flag that descriptions are critical for search filtering.",
    ].join("\n"),
    [LABEL_DATAVERSE_TABLES]: [
      "Read Requirements/spec.md and Requirements/architecture.md.",
      "Use the Dataverse table specification from the architecture and create the Dataverse tables now.",
      "This is a required build action, not a suggestion. Perform it immediately. Do not wait for the developer to prompt you again.",
      "Do not stop at schema advice or placeholder logical-name guidance.",
      "Create the minimum tables, relationships, and columns needed to support the solution.",
      "Keep the schema aligned to a shared connector set: one generic read tool, one generic write tool, and one generic delete tool only if the architecture needs destructive operations.",
      "Do not create one CRUD tool or one schema fragment per function unless the architecture explicitly requires it.",
      "If Dataverse MCP is available in GitHub Copilot Chat Agent mode, use it to create the tables and then inspect the created table schema through the Dataverse MCP server.",
      "Run a Dataverse sample-data stage and insert the required startup records that let the agent work immediately, such as SLA policies, routing rules, lookup values, or known issues when those are implied by the spec or architecture.",
      "Do not leave required sample data as a next step.",
      "Do not continue to Dataverse connector descriptions or mark the build step complete until the tables have actually been created.",
      "After the tables are created, replace any placeholder Dataverse logical-name guidance with the real schema names and valid OData examples based on the created tables.",
      "After the Dataverse MCP server confirms the live schema, align Dataverse action descriptions, OData examples, and topic logic to the exact live logical field names.",
      "For choice/option-set columns, the Dataverse MCP Server requires integer values — passing text labels (e.g. 'High') causes a FormatException. After table creation, inspect the choice definitions and include the integer mappings (e.g. High=100000002) in agent instructions and tool descriptions so the agent passes valid values.",
      "Do not leave live field-name alignment as a next step.",
      "Then summarise which tables, key columns, and relationships were added.",
      "Also summarise which sample data was inserted and which live logical names downstream steps must use.",
    ].join("\n"),
    [LABEL_DATAVERSE_SAMPLE_DATA]: [
      "Read architecture.md and spec.md for any required startup data.",
      "Insert sample records into Dataverse tables: SLA policies, routing rules, lookup values, known issues,",
      "or any other data the agent needs to function immediately after deployment.",
      "If Dataverse MCP is available, use it to insert the records and verify they exist.",
      "Do not leave sample data insertion as a next step.",
    ].join("\n"),
    [LABEL_AGENT_INSTRUCTIONS]: [
      "Read architecture.md and spec.md. For each agent, generate the agent instructions and update the local CPS YAML directly when cloned files exist in the workspace.",
      "For top-level agent YAML, also generate suggested prompts from the spec and architecture and update the `conversationStarters` field directly using this exact YAML shape:",
      "conversationStarters:",
      "  - title: Suggest 1",
      "    text: Suggested Prompt 1",
      "  - title: Suggest 2",
      "    text: Suggested Prompt 2",
      "For child agent files with `kind: AgentDialog`, update `settings.instructions` in `agents/*/agent.mcs.yml`.",
      "For top-level agent files, update the normal top-level instructions field in the agent YAML.",
      "Suggested prompts should be short, specific, and realistic for Teams / Microsoft 365 entry points.",
      "Follow prompt-engineering.md patterns. Key rules:",
      "- If the agent has tools: ALWAYS instruct it to use tools FIRST before general knowledge",
      '- If the agent has MCP tools: reference the tool by exact name, e.g. "Always use /MCP_Dataverse to query tables"',
      "- Positive instructions > negative ones",
      "- Keep under ~2000 chars to avoid latency",
      '- Add explicit fallback: "If you cannot find the answer using your tools, say so"',
      '- Consider disabling "Use general knowledge" if tools cover the full domain',
      "- Do NOT answer with manual steps telling the developer to paste those instructions into Overview pages when the files already exist locally",
    ].join("\n"),
    [LABEL_TOPIC_DESCRIPTIONS]: [
      "Read architecture.md and the existing topics/*.yaml files.",
      "For each topic, write a DESCRIPTION that tells the orchestrator exactly when to invoke it.",
      "Follow tool-descriptions.md patterns: what it handles, what it does NOT handle.",
      "For deterministic parent-agent behavior such as incident status lookup or a one-question clarification loop, create or update parent Topic logic rather than describing it as a workflow.",
      "Update ConversationStart and Fallback topics to match the agent's domain.",
    ].join("\n"),
    [LABEL_TOOL_DESCRIPTIONS]: [
      "Read architecture.md and the existing action files.",
      "For each tool/action, write a DESCRIPTION following tool-descriptions.md patterns:",
      '"[What it does]. Call when [specific intents]. Requires [inputs]. Do NOT use for [exclusions]."',
      "CRITICAL: Vague tool descriptions are the #1 cause of wrong tool selection.",
      "The description must be specific enough that the orchestrator picks this tool for the right queries.",
    ].join("\n"),
    [LABEL_SYSTEM_TOPICS]: [
      "Read architecture.md and the existing topics/*.yaml files.",
      "Customise the ConversationStart topic to match the agent's domain and greeting.",
      "Customise the Fallback topic with rephrase prompts and escalation after repeated failures.",
      "Build the OnError topic: capture UTC timestamp, branch on InTestMode for diagnostics vs user-safe messages,",
      "log via LogCustomTelemetryEvent, and end with CancelAllDialogs.",
      "If an Escalation topic is needed, configure it per architecture.md.",
    ].join("\n"),
    [LABEL_TRIGGER_DESCRIPTIONS]: [
      "Read architecture.md and update trigger descriptions for any event or scheduled triggers.",
      "Each trigger description should clearly state: what event fires it, what the agent should do,",
      "and any security constraints (parameter limits, allowed recipients, knowledge source checks).",
    ].join("\n"),
    [LABEL_SETTINGS_COHERENCE]: [
      "Read settings.mcs.yml and agent.mcs.yml.",
      "Check that enabled capabilities have corresponding implementations:",
      "- isSemanticSearchEnabled=true requires configured knowledge sources",
      "- useModelKnowledge=false + webBrowsing=true is contradictory",
      "- useModelKnowledge=false suppresses clarifying questions",
      "- optInUseLatestModels vs modelNameHint may conflict",
      "Fix mismatches against the architecture specification.",
    ].join("\n"),
    [LABEL_TOOLNAME_REFERENCES]: [
      "Scan all agent instructions and topic YAML for /ToolName references.",
      "Cross-check every /ToolName against the actual modelDisplayName in the workspace action YAML files.",
      "A /ToolName referencing a tool that doesn't exist causes a silent skip with no error.",
      "Report any mismatches and suggest corrections.",
    ].join("\n"),
    [LABEL_CONTENT_MODERATION]: [
      "Content moderation must be configured in the CPS portal under Settings > Generative AI.",
      "There is no YAML field for this — it is a portal-only setting.",
      "For agents processing financial, medical, legal, HR, or specialist domain content,",
      "Low moderation may be necessary to avoid false positive blocking of legitimate terms.",
      "Set the level appropriate for the agent's domain and document the decision.",
    ].join("\n"),
    [LABEL_INITIAL_TESTING]: [
      "The agent is ready for initial testing. Test these scenarios from spec.md:",
      "1. Run each success criteria example through the CPS portal test pane",
      "2. Test an out-of-scope query to verify the agent declines properly",
      "3. Paste the test output here and I will evaluate against spec.md",
      "IMPORTANT: Test pane uses maker credentials — also test in the target channel (Teams, etc.)",
    ].join("\n"),
    [LABEL_ITERATION_COMPLETE]: [
      "Review all test results against spec.md.",
      "Check: Does every success criterion pass? Are there routing errors? Is the agent using tools correctly?",
      "If issues remain, describe them and I will suggest specific changes to instructions, descriptions, or architecture.",
    ].join("\n"),
  };

  return (
    prompts[stepLabel] ||
    [
      `Help me complete this build step: "${stepLabel}".`,
      "Read Requirements/spec.md and Requirements/architecture.md for context.",
      spec ? "Use the spec as the product intent." : "",
      architecture
        ? "Use the architecture as the implementation constraint set."
        : "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}
