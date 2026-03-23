import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import {
  readMarkdownFiles,
  findCpsAgentFolders,
  FileEntry,
} from "../services/fileUtils.js";
import { requireWorkspaceRoot, copyPromptAndNotify } from "../ui/uiUtils.js";
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
  const specPath = path.join(root, "requirements", "spec.md");
  let spec: string;
  try {
    spec = await fs.readFile(specPath, "utf-8");
  } catch {
    const action = await vscode.window.showWarningMessage(
      "CPSAgentKit: requirements/spec.md not found. Create a spec first?",
      "Create Spec",
      "Cancel",
    );
    if (action === "Create Spec") {
      await vscode.commands.executeCommand("cpsAgentKit.createSpec");
    }
    return;
  }

  // Require architecture.md
  const archPath = path.join(root, "requirements", "architecture.md");
  let architecture: string;
  try {
    architecture = await fs.readFile(archPath, "utf-8");
  } catch {
    const action = await vscode.window.showWarningMessage(
      "CPSAgentKit: requirements/architecture.md not found. Create architecture first?",
      "Create Architecture",
      "Cancel",
    );
    if (action === "Create Architecture") {
      await vscode.commands.executeCommand("cpsAgentKit.createArchitecture");
    }
    return;
  }

  // Read additional requirements docs
  const docsDir = path.join(root, "requirements", "docs");
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
        description: "Generate/update agent instructions for the Overview page",
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
  );

  // Copy to clipboard and notify
  await copyPromptAndNotify(
    prompt,
    "CPSAgentKit: Build prompt copied to clipboard. Paste into Copilot Chat to generate the agent.",
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
          "The following additional requirement documents are in `requirements/docs/`. Use them as context for building the agent:",
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
          "1. **Agent instructions** — to paste into the CPS portal Overview page",
          "2. **Topic descriptions** — for each topic, the description that drives orchestrator routing",
          "3. **Tool/action descriptions** — for each tool, the description that tells the orchestrator when to call it",
          "4. **ConversationStart topic** — greeting message matching the agent's purpose",
          "5. **Fallback topic** — domain-specific fallback that guides users toward valid queries",
          "6. **Manual portal steps** — anything that must be configured in the CPS portal UI",
          "",
          "If CPS agent YAML files exist in the workspace, modify them directly. Otherwise, provide the text to paste into the portal.",
          "After generating, update the Build State checklist in architecture.md.",
        ].join("\n")
      );

    case "instructions":
      return (
        base +
        [
          "## Task: Agent Instructions",
          "For each agent in the architecture, generate the agent instructions to paste into the CPS portal Overview page.",
          "If CPS agent YAML files exist, update the agent instructions in the YAML directly.",
        ].join("\n")
      );

    case "topics":
      return (
        base +
        [
          "## Task: Topic Descriptions",
          "For each topic in each agent, write the trigger description that tells the orchestrator when to invoke it.",
          "Include what the topic handles and what it does NOT handle.",
          "Update ConversationStart and Fallback topics to match the agent's domain.",
          "If CPS agent YAML files exist, update the topic YAML files directly.",
        ].join("\n")
      );

    case "tools":
      return (
        base +
        [
          "## Task: Tool Descriptions",
          "For each tool/connector/action in each agent, write the description following this pattern:",
          '"[What it does]. Call when [specific intents]. Requires [inputs]. Do NOT use for [exclusions]."',
          "If CPS agent YAML files exist, update ONLY the modelDescription field in the action YAML files. Do not modify any other fields — they are platform-generated and will break the agent if altered.",
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
