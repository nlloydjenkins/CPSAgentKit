import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import {
  readMarkdownFiles,
  findCpsAgentFolders,
  FileEntry,
} from "../services/fileUtils.js";
import {
  composeDataverseChatPrompt,
  detectDataverseMcp,
} from "../services/preBuildGenerator.js";
import { requireWorkspaceRoot, openPromptAndNotify } from "../ui/uiUtils.js";
import { configDirPath } from "../services/config.js";

/**
 * Build Agent command — reads spec.md + architecture.md + knowledge,
 * composes a build prompt, and sends it to Copilot Chat.
 */
export async function buildAgentCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  // Require spec.md
  const specPath = path.join(root, "Requirements", "spec.md");
  let spec: string;
  try {
    spec = await fs.readFile(specPath, "utf-8");
  } catch {
    const action = await vscode.window.showWarningMessage(
      "CPSAgentKit: Requirements/spec.md not found. Create specification first?",
      "Create Specification",
      "Cancel",
    );
    if (action === "Create Specification") {
      await vscode.commands.executeCommand("cpsAgentKit.createSpec");
    }
    return;
  }

  // Require architecture.md
  const archPath = path.join(root, "Requirements", "architecture.md");
  let architecture: string;
  try {
    architecture = await fs.readFile(archPath, "utf-8");
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

  // Read additional requirements docs
  const docsDir = path.join(root, "Requirements", "docs");
  const requirementsDocs = await readMarkdownFiles(docsDir);

  // Read synced knowledge and best practices from .cpsagentkit/
  const cpsDir = configDirPath(root);
  const knowledgeFiles = await readMarkdownFiles(
    path.join(cpsDir, "knowledge"),
  );
  const bestPracticesFiles = await readMarkdownFiles(
    path.join(cpsDir, "bestpractices"),
  );

  // Detect existing CPS agent YAML files
  const agentYaml = await findCpsAgentFolders(root);

  // What does the user want to build?
  const scope = await vscode.window.showQuickPick(
    [
      {
        label: "Full build",
        description:
          "Generate all agent config: instructions, topics, tool descriptions",
        detail: "full",
      },
      {
        label: "Agent instructions only",
        description:
          "Generate/update top-level and child-agent instructions in YAML",
        detail: "instructions",
      },
      {
        label: "Topic descriptions only",
        description: "Generate/update topic trigger descriptions",
        detail: "topics",
      },
      {
        label: "Tool descriptions only",
        description: "Generate/update tool/action descriptions",
        detail: "tools",
      },
      {
        label: "Settings validation",
        description:
          "Check settings.mcs.yml coherence against architecture spec",
        detail: "settings",
      },
      {
        label: "Validate /ToolName references",
        description:
          "Check that instruction /ToolName refs match action YAML files",
        detail: "validate",
      },
      {
        label: "Rebuild from test feedback",
        description: "Paste test output and get specific fixes",
        detail: "test",
      },
    ],
    {
      title: "CPSAgentKit: Build Agent",
      placeHolder: "What do you want to build?",
      ignoreFocusOut: true,
    },
  );
  if (!scope) {
    return;
  }

  let testOutput = "";
  if (scope.detail === "test") {
    testOutput =
      (await vscode.window.showInputBox({
        prompt: "Paste the test output from the CPS portal test pane",
        placeHolder: "Copy the conversation from the test pane and paste here",
        ignoreFocusOut: true,
      })) || "";
    if (!testOutput) {
      return;
    }
  }

  let dataverseBuildPrompt = "";
  if (scope.detail === "full") {
    const mcpStatus = await detectDataverseMcp(root);
    dataverseBuildPrompt = composeDataverseChatPrompt(
      spec,
      architecture,
      mcpStatus.environmentUrl,
    );
  }

  // Build the prompt
  const prompt = composeBuildPrompt(
    scope.detail!,
    spec,
    architecture,
    agentYaml,
    testOutput,
    requirementsDocs,
    knowledgeFiles,
    bestPracticesFiles,
    dataverseBuildPrompt,
  );

  // Load the build prompt into GitHub Copilot Chat and notify
  await openPromptAndNotify(
    prompt,
    dataverseBuildPrompt
      ? "CPSAgentKit: Build prompt loaded into GitHub Copilot Chat. Press Enter to run the full build, including Dataverse table creation first."
      : "CPSAgentKit: Build prompt loaded into GitHub Copilot Chat. Press Enter to generate the agent.",
  );
}

/** Compose the build prompt based on scope */
function composeBuildPrompt(
  scope: string,
  spec: string,
  architecture: string,
  agentFolders: string[],
  testOutput: string,
  requirementsDocs: FileEntry[],
  knowledgeFiles: FileEntry[],
  bestPracticesFiles: FileEntry[],
  dataverseBuildPrompt: string,
): string {
  const agentContext =
    agentFolders.length > 0
      ? `\n\nExisting CPS agent folders in workspace: ${agentFolders.join(", ")}. Read the YAML files in these folders to understand the current agent configuration before making changes.`
      : "";

  const docsContext =
    requirementsDocs.length > 0
      ? [
          "",
          "## Requirements Docs",
          "",
          "The following additional requirement documents are in `Requirements/docs/`. Use them as context for building the agent:",
          "",
          ...requirementsDocs.map(
            (d) =>
              `### ${d.filename.replace(/\.md$/, "").replace(/-/g, " ")}\n\n${d.content}`,
          ),
        ].join("\n")
      : "";

  const knowledgeContext =
    knowledgeFiles.length > 0
      ? [
          "",
          "## CPS Platform Knowledge",
          "",
          "Follow these patterns and constraints when building the agent:",
          "",
          ...knowledgeFiles.map(
            (d) =>
              `### ${d.filename.replace(/\.md$/, "").replace(/-/g, " ")}\n\n${d.content}`,
          ),
        ].join("\n")
      : "";

  const bestPracticesContext =
    bestPracticesFiles.length > 0
      ? [
          "",
          "## CPS Best Practices",
          "",
          "Apply these best practices when generating agent configuration:",
          "",
          ...bestPracticesFiles.map(
            (d) =>
              `### ${d.filename.replace(/\.md$/, "").replace(/-/g, " ")}\n\n${d.content}`,
          ),
        ].join("\n")
      : "";

  const dataverseBuildContext =
    scope === "full" && dataverseBuildPrompt
      ? [
          "",
          "## Dataverse Table Creation",
          "",
          "If the architecture uses Dataverse, Build owns table creation.",
          "This is a required first build action. Do not wait for the developer to prompt you. Do not defer it. Create the Dataverse tables before any other build step that depends on Dataverse.",
          "Run this Dataverse MCP task first, then continue with the rest of the build using the real logical names you created:",
          "",
          "```text",
          dataverseBuildPrompt,
          "```",
          "",
          "After the tables exist, run a Dataverse sample-data stage and insert the required startup records that let the agent work immediately, such as SLA policies, routing rules, lookup values, or known issues when those are implied by the spec or architecture.",
          "Do not leave required sample data as a suggested next step.",
          "After the tables exist, update Dataverse action modelDescriptions with the real table names, real logical field names, and one valid OData example per use case.",
          "After the Dataverse MCP server confirms the live schema, align Dataverse action descriptions, OData examples, and topic logic to the exact live logical field names immediately.",
          "For choice/option-set columns, the Dataverse MCP Server requires integer values — passing text labels (e.g. 'High') causes a FormatException. After table creation, inspect the choice definitions and include the integer mappings (e.g. High=100000002) in agent instructions and tool descriptions so the agent passes valid values.",
          "Do not leave live field-name alignment as a suggested next step.",
          "Do not ask the developer to create Dataverse tables manually when the Dataverse MCP task above is present.",
          "Do not report the build as complete, or move on to Dataverse connector descriptions, until the tables, columns, relationships, required sample data, and live field-name alignment are complete.",
        ].join("\n")
      : "";

  const base = [
    "You are building a Copilot Studio agent. Read these documents carefully:",
    "",
    "## Spec",
    spec,
    "",
    "## Architecture",
    architecture,
    agentContext,
    docsContext,
    knowledgeContext,
    bestPracticesContext,
    dataverseBuildContext,
    "",
    "## Rules",
    "",
    "### CRITICAL: Tool/Action Connection Integrity",
    "- Tool names in /ToolName references in agent instructions MUST match the EXACT name in the action YAML files",
    "- Before writing any /ToolName reference, read the action YAML files in the workspace to get the correct current name",
    "- If you rename a tool/action connector, you MUST update EVERY reference to it: all /ToolName references in instructions, topic triggers, and any other YAML that references it. A single missed reference = broken agent",
    "- Prefer keeping existing tool names unless the user explicitly asks to rename them",
    "- NEVER delete or recreate a tool/action connection — update the existing one instead",
    '- If a tool is named "Microsoft Dataverse MCP Server (Preview)", every instruction must say /Microsoft Dataverse MCP Server (Preview) — not a shortened or altered version — unless you are renaming it AND updating all references',
    "",
    "### CRITICAL: Tool/Action YAML Safety",
    "- Action YAML files have platform-generated structures. Most fields are UNTOUCHABLE.",
    "- SAFE to edit: modelDisplayName and modelDescription ONLY",
    "- NEVER use >- or | block scalar syntax for modelDescription — block scalars break tools in CPS. Always use plain inline strings.",
    "- NEVER modify: mcs.metadata, kind, inputs, outputs, outputMode, action (and everything under it: connectionReference, connectionProperties, operationDetails, operationId, dynamicOutputSchema, flowId, knownTools)",
    "- This applies to ALL tool types: MCP servers (InvokeExternalAgentTaskAction), connectors (InvokeConnectorTaskAction), and flows (InvokeFlowTaskAction)",
    "- When asked to update a tool description, edit ONLY the modelDescription field. Do not touch any other field.",
    "- When asked to add a new tool, tell the developer to create it in the CPS portal and sync — do not generate action YAML from scratch.",
    "",
    "### Build Rules",
    '- If the agent has tools (MCP servers, connectors, flows): instructions MUST say "Always use [exact tool name] to answer questions. Do not use general knowledge when the tool can provide the answer."',
    "- Reference tools by exact name using /ToolName syntax in instructions",
    '- Consider recommending "Use general knowledge" be DISABLED if tools cover the full domain',
    "- If the Dataverse Table Creation section is present, create the Dataverse tables immediately as the first build action before doing any other Dataverse-dependent work.",
    "- Do not wait for the developer to say 'create the Dataverse tables'. The presence of the Dataverse Table Creation section means you must perform that step now.",
    "- For Dataverse-backed solutions, run a sample-data stage before closing the Dataverse portion of the build when the solution depends on startup reference data.",
    "- For Dataverse-backed solutions, align action descriptions, OData examples, and topic logic to the exact live logical field names after the Dataverse MCP server confirms the schema.",
    "- If CPS agent YAML files exist in the workspace, perform the build by editing those files directly. Do NOT answer with instructions telling the developer to paste content into Overview pages, topic editors, or tool descriptions.",
    "- Do NOT tell the developer to run Get Changes as part of Build when the cloned YAML files already exist locally. Build should modify the local files directly.",
    "- Child agents use a different YAML shape from top-level agents. A child agent file typically has `kind: AgentDialog` and its instructions live at `settings.instructions` inside `agents/*/agent.mcs.yml`.",
    "- When updating child agents, edit `settings.instructions` in the child agent YAML directly. Do NOT treat child-agent instructions as top-level `instructions:` fields or as manual Overview-page paste blocks.",
    "- In Copilot Studio, implement parent orchestration through the parent agent instructions plus Topics, child agents, tools, and triggers. Do NOT describe this as a workflow to scaffold.",
    "- If the parent needs deterministic status lookup or a one-question clarification loop, implement that through one or more parent Topics rather than inventing a workflow concept.",
    '- Write tool descriptions following this pattern: "[What it does]. Call when [specific intents]. Requires [inputs]. Do NOT use for [exclusions]."',
    "- Topic descriptions must tell the orchestrator exactly when to invoke them and when NOT to",
    "- Keep agent instructions under ~2000 characters",
    "- If something needs manual portal creation, list the exact steps and settings",
    "",
  ].join("\n");

  switch (scope) {
    case "full":
      return (
        base +
        [
          "## Task: Full Build",
          "Generate ALL of the following for each agent in the architecture:",
          ...(dataverseBuildPrompt
            ? [
                "0. **Dataverse tables first** — this is a required first build action. Create the Dataverse tables, columns, and relationships using the Dataverse Table Creation section above before updating Dataverse connector descriptions, generating final Dataverse guidance, or reporting build completion.",
                "0a. Do this immediately when you start the build. Do not wait for any additional developer prompt.",
                "0b. Run the Dataverse sample-data stage before leaving the Dataverse step. Do not return sample data as a later suggestion when the solution depends on it.",
                "0c. After the Dataverse MCP server confirms the live schema, align all Dataverse action descriptions, OData examples, and topic logic to the exact live logical names before continuing.",
              ]
            : []),
          "1. **Agent instructions** — update the relevant agent YAML directly. For top-level agents, update the top-level instructions field in the agent YAML. For child agents (`kind: AgentDialog`), update `settings.instructions` in `agents/*/agent.mcs.yml`. Use /ToolName syntax referencing EXACT modelDisplayName from action YAML files (including ` 1` suffixes on child agent tools).",
          "2. **Suggested prompts** — for each top-level agent, generate concise, high-value suggested prompts derived from the spec and architecture and update the top-level `conversationStarters` field in the agent YAML. Use this exact YAML shape:",
          "   conversationStarters:",
          "     - title: Suggest 1",
          "       text: Suggested Prompt 1",
          "     - title: Suggest 2",
          "       text: Suggested Prompt 2",
          "   Do not add suggested prompts to child-agent YAML unless that file shape already supports them.",
          "3. **Topic descriptions** — for each custom topic, the description that drives orchestrator routing",
          "4. **Tool/action modelDescriptions** — for EVERY action YAML, generate a detailed modelDescription from the architecture's tool description specs (§ Dataverse Connector Tool Descriptions or equivalent). Include table routing logic, valid tables, filterable columns, and explicit exclusions. Generic platform defaults MUST be replaced.",
          "5. **System topic customisation** — ConversationStart (greeting listing agent capabilities from architecture), Fallback (domain-specific re-prompting with capability guidance), Escalation (helpdesk contact + escalation logging from architecture), OnError (timestamp, test/prod branching, telemetry, CancelAllDialogs)",
          "6. **Trigger descriptions** — for each autonomous trigger in the architecture's trigger table, replace the generic description with the architecture-specific trigger definition (e.g. AT-001 Daily Operations Scan)",
          "7. **Settings coherence** — validate settings.mcs.yml against architecture: useModelKnowledge, webBrowsing, isSemanticSearchEnabled, content moderation level. Flag any mismatches.",
          "8. **Manual portal steps** — anything that must be configured in the CPS portal UI. Explicitly flag content moderation as portal-only (no YAML surface).",
          "",
          "If CPS agent YAML files exist in the workspace, modify them directly and report the file changes you made. Only provide portal-ready text when there are no local CPS YAML files to edit.",
          dataverseBuildPrompt
            ? "For Dataverse-backed solutions, do not stop at schema advice. Actually create the tables first using the Dataverse MCP task above, load the required sample data, then continue the build with the real schema names you created and aligned live field names."
            : "",
          "Do not return a plan that tells the developer to paste child-agent instruction blocks into Overview pages when those child-agent YAML files already exist in the workspace.",
          "When you find a child agent with YAML shaped like `kind: AgentDialog` plus `settings.instructions`, update that `settings.instructions` field directly.",
          "If the parent needs deterministic status lookup or a one-question clarification loop, create or update the relevant parent Topic(s) and wire that logic there. Do not describe this as a workflow to scaffold.",
          "After generating, validate that every /ToolName reference in instructions maps to an actual action YAML file with a matching modelDisplayName.",
          "After generating, update the Build State checklist in architecture.md.",
        ].join("\n")
      );

    case "instructions":
      return (
        base +
        [
          "## Task: Agent Instructions",
          "For each agent in the architecture, generate or update the agent instructions.",
          "If CPS agent YAML files exist, update the agent instructions in the YAML directly and report the files changed.",
          "For top-level agent YAML, also generate suggested prompts and update the `conversationStarters` field directly from the spec and architecture using this exact YAML shape:",
          "conversationStarters:",
          "  - title: Suggest 1",
          "    text: Suggested Prompt 1",
          "  - title: Suggest 2",
          "    text: Suggested Prompt 2",
          "For child agent files with `kind: AgentDialog`, update `settings.instructions` in `agents/*/agent.mcs.yml`.",
          "For top-level agent files, update the normal top-level instructions field in the agent YAML.",
          "Suggested prompts should be short, concrete, and channel-ready for Teams / Microsoft 365 surfaces.",
          "Do NOT answer with manual steps telling the developer to paste instruction blocks into the portal when those files already exist locally.",
        ].join("\n")
      );

    case "topics":
      return (
        base +
        [
          "## Task: Topic Descriptions",
          "",
          "### Custom Topics",
          "For each custom topic in the architecture, write the trigger description that tells the orchestrator when to invoke it.",
          "Include what the topic handles AND what it does NOT handle (explicit exclusions prevent misrouting).",
          "",
          "### System Topic Customisation",
          "Replace generic platform defaults with domain-specific versions:",
          "- **ConversationStart** — greeting that lists the agent's capabilities from the architecture (not generic 'How can I help?')",
          "- **Fallback** — domain-specific message that guides users toward valid queries the agent actually supports",
          "- **Escalation** — helpdesk contact details and escalation logging from the architecture's escalation topic spec",
          "- **OnError** — capture timestamp, branch on test vs production mode, log telemetry, end with CancelAllDialogs",
          "",
          "### Trigger Descriptions",
          "For each autonomous trigger in trigger/ YAML files, replace the generic 'Create a trigger to automatically call your copilot repeatedly' with the architecture-specific trigger definition (schedule, target operation, delegation target).",
          "",
          "If CPS agent YAML files exist, update the topic YAML files directly.",
        ].join("\n")
      );

    case "tools":
      return (
        base +
        [
          "## Task: Tool Descriptions",
          "",
          "For EVERY action YAML file in the workspace, generate a detailed modelDescription.",
          "",
          "### Source",
          "Read the architecture's tool description specifications (§ Dataverse Connector Tool Descriptions or equivalent tables). These contain EXACT descriptions that map to modelDescription values.",
          "",
          "### Process",
          "1. Read each action .mcs.yml file to get the current modelDisplayName",
          "2. Find the matching tool in the architecture's tool tables",
          "3. Generate a detailed modelDescription from the architecture specification",
          "4. For Dataverse connectors: include valid tables, per-table purpose, filterable columns with schema names, OData filter examples, and explicit exclusions",
          "5. For Outlook/email connectors: include shared mailbox address, when to call, what to include, logging requirements",
          "6. For child agent tool copies (with ` 1` suffix): scope the description to that agent's operations only",
          "",
          '### Pattern: "[What it does]. Call when [specific intents]. Requires [inputs]. Do NOT use for [exclusions]."',
          "",
          "### Safety",
          "Update ONLY the modelDescription field in action YAML. Do not modify any other fields — mcs.metadata, kind, inputs, outputs, action, connectionReference, connectionProperties, operationId, dynamicOutputSchema are all platform-generated and will break the agent if altered.",
          "NEVER use >- or | block scalar syntax for modelDescription — block scalars break tools in CPS. Always use plain inline strings.",
        ].join("\n")
      );

    case "settings":
      return (
        base +
        [
          "## Task: Settings Coherence Validation",
          "",
          "Read settings.mcs.yml and agent.mcs.yml for each agent and validate against the architecture spec:",
          "",
          "### Checks",
          "1. **useModelKnowledge** — Should be `false` if architecture says general knowledge is disabled. `true` means the agent answers from GPT knowledge instead of grounding in tools/knowledge sources.",
          "2. **webBrowsing** — Should be `false` for internal agents. `true` means the agent searches the web, which is wrong for confidential data.",
          "3. **isSemanticSearchEnabled** — Should be `false` if no knowledge sources are uploaded yet. Enabled without knowledge sources = dead config.",
          "4. **isFileAnalysisEnabled** — Flag if enabled with no corresponding implementation.",
          "5. **optInUseLatestModels** vs **modelNameHint** — Check for conflicts. Document intended model strategy.",
          "6. **Content moderation** — Architecture may specify Low for legal/medical/HR domains. This is portal-only (no YAML surface) — flag as required manual step.",
          "7. **GenerativeActionsEnabled** — Must be `true` for generative orchestration to work.",
          "8. **authenticationMode** — Must match architecture's auth specification.",
          "",
          "### Output",
          "For each setting that doesn't match the architecture, provide:",
          "- Current value in YAML",
          "- Expected value from architecture",
          "- Impact if left as-is",
          "- Exact YAML change to make (or flag as portal-only)",
        ].join("\n")
      );

    case "validate":
      return (
        base +
        [
          "## Task: Validate /ToolName References",
          "",
          "Cross-check all /ToolName references in agent instructions against action YAML files:",
          "",
          "### Checks",
          "1. **Every /ToolName reference maps to an action YAML** — read agent.mcs.yml instructions for all `/ToolName` patterns. For each, verify an action .mcs.yml exists with a matching modelDisplayName.",
          "2. **Name matches exactly** — including the ` 1` suffix on child agent tool copies. `/List rows from selected environment` ≠ `/List rows from selected environment 1`.",
          "3. **No orphaned actions** — every action .mcs.yml should have a corresponding /ToolName reference in the owning agent's instructions. An unreferenced tool may indicate a missing instruction.",
          "4. **Cross-agent references** — parent agent instructions may reference child agent tools incorrectly (child tools have suffix, parent tools don't).",
          "",
          "### Output",
          "- List all /ToolName references found in instructions",
          "- For each, show: matched action file (or MISSING), exact modelDisplayName",
          "- List any action files with NO /ToolName reference",
          "- Provide exact fixes for any mismatches",
        ].join("\n")
      );

    case "test":
      return (
        base +
        [
          "## Task: Evaluate Test Output",
          "The developer tested the agent and got these results:",
          "",
          "```",
          testOutput,
          "```",
          "",
          "Evaluate against the spec:",
          "1. Did the agent route correctly?",
          "2. Did it use the right tool (not general knowledge)?",
          "3. Did it stay in scope?",
          "4. Did the response match the success criteria in spec.md?",
          "",
          "Diagnose specific issues and suggest exact changes to instructions, descriptions, or topic configuration.",
          "If the agent answered from general knowledge instead of calling a tool, that is a critical issue — fix the tool description and agent instructions.",
        ].join("\n")
      );

    default:
      return base;
  }
}
