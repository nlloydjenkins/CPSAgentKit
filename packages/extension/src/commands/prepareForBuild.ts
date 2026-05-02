import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import {
  readMarkdownFiles,
  findCpsAgentFolders,
} from "../services/fileUtils.js";
import { configDirPath } from "../services/config.js";
import { detectDataverseMcp } from "../services/preBuildGenerator.js";
import { requireWorkspaceRoot, writePromptAndOpenChat } from "../ui/uiUtils.js";

async function readRequiredFile(
  filePath: string,
  missingMessage: string,
): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    const action = await vscode.window.showWarningMessage(
      missingMessage,
      "Create Plan",
      "Cancel",
    );
    if (action === "Create Plan") {
      await vscode.commands.executeCommand("cpsAgentKit.createSpec");
    }
    return undefined;
  }
}

/** Prepare for Build command - creates the portal/readiness runbook before mutation. */
export async function prepareForBuildCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  const spec = await readRequiredFile(
    path.join(root, "Requirements", "spec.md"),
    "CPSAgentKit: Requirements/spec.md not found. Create plan first?",
  );
  if (!spec) {
    return;
  }

  const architecture = await readRequiredFile(
    path.join(root, "Requirements", "architecture.md"),
    "CPSAgentKit: Requirements/architecture.md not found. Create plan first?",
  );
  if (!architecture) {
    return;
  }

  const cpsDir = configDirPath(root);
  const [requirementsDocs, knowledgeFiles, bestPracticesFiles, agentFolders] =
    await Promise.all([
      readMarkdownFiles(path.join(root, "Requirements", "docs")),
      readMarkdownFiles(path.join(cpsDir, "knowledge")),
      readMarkdownFiles(path.join(cpsDir, "bestpractices")),
      findCpsAgentFolders(root),
    ]);
  const dataverseMcp = await detectDataverseMcp(root);

  const prompt = composePrepareForBuildPrompt({
    spec,
    architecture,
    requirementsDocs,
    knowledgeFiles,
    bestPracticesFiles,
    agentFolders,
    dataverseMcpConfigured: dataverseMcp.configured,
    dataverseEnvironmentUrl: dataverseMcp.environmentUrl,
  });

  await writePromptAndOpenChat(
    root,
    "prepare-build",
    prompt,
    "Requirements/build-prep.md",
    "Prepare for Build prompt generated.",
  );
}

interface PreparePromptInput {
  spec: string;
  architecture: string;
  requirementsDocs: Array<{ filename: string; content: string }>;
  knowledgeFiles: Array<{ filename: string; content: string }>;
  bestPracticesFiles: Array<{ filename: string; content: string }>;
  agentFolders: string[];
  dataverseMcpConfigured: boolean;
  dataverseEnvironmentUrl?: string;
}

function composeSection(
  heading: string,
  files: Array<{ filename: string; content: string }>,
): string {
  if (files.length === 0) {
    return "";
  }
  return [
    "",
    `## ${heading}`,
    "",
    ...files.map((file) => `### ${file.filename}\n\n${file.content.trimEnd()}`),
  ].join("\n");
}

function composePrepareForBuildPrompt(input: PreparePromptInput): string {
  const agentContext =
    input.agentFolders.length > 0
      ? `Existing CPS agent folders detected: ${input.agentFolders.join(", ")}. Read these folders before recommending portal or YAML work.`
      : "No cloned CPS agent folders detected yet.";

  const dataverseContext = input.dataverseMcpConfigured
    ? `Dataverse MCP appears configured${input.dataverseEnvironmentUrl ? ` for ${input.dataverseEnvironmentUrl}` : ""}. Do not create schema during Prepare for Build; verify the Build stage has enough table, column, relationship, choice, and seed-data detail to create it later.`
    : "Dataverse MCP was not detected. If the architecture depends on Dataverse table creation or prompt-tool Dataverse updates, mark this as a blocker before Build.";

  return [
    "# Prepare for Build",
    "",
    "You are preparing a Copilot Studio solution for build. This is a readiness and portal-scaffold phase, not the implementation phase.",
    "",
    "## Inputs",
    "",
    "### Spec",
    "",
    input.spec,
    "",
    "### Architecture",
    "",
    input.architecture,
    composeSection("Requirements Docs", input.requirementsDocs),
    composeSection("CPS Knowledge", input.knowledgeFiles),
    composeSection("Best Practices", input.bestPracticesFiles),
    "",
    "## Current Workspace Signals",
    "",
    `- ${agentContext}`,
    `- ${dataverseContext}`,
    "",
    "## Goal",
    "",
    "Create a pre-build runbook and reconcile the architecture so the subsequent Build Agent command can safely perform Dataverse creation, local YAML edits, and post-build validation.",
    "",
    "## Required Work",
    "",
    "1. Read Requirements/spec.md, Requirements/architecture.md, all Requirements/docs files, synced knowledge, and best practices.",
    "2. Validate the architecture against CPS constraints: child-agent MCP limits, child-owned trigger prohibition, tool-count limits, general knowledge stance, DLP/auth/channel constraints, content moderation, and prompt-tool vs child-agent tradeoffs.",
    "3. Identify portal-first scaffold steps that must happen before local YAML can be safely edited: agents, child agents, connected agents, MCP server connections, prompt tools, standard connector actions, Power Automate flows, knowledge sources, autonomous triggers, channel/auth settings, DLP, and content moderation.",
    "4. Split portal work into two groups:",
    "   - Safe before Build: portal objects that do not depend on Dataverse tables or live schema names.",
    "   - Deferred until after Dataverse Build: connector actions or prompt-tool bindings that require tables, columns, relationships, choices, or prompt input definitions that do not exist yet.",
    "5. If Dataverse tables are required, ensure architecture.md has enough detail for Build to create them: table display names, intended logical names if known, columns, types, required flags, relationships, choice values, seed/reference records, and verification queries.",
    "6. If AI prompt tools are required, ensure architecture.md records the prompt tool names, input placeholders, expected output shape, whether code interpreter is needed, and how instructions will be updated after portal creation. Prompt-tool instruction text lives in Dataverse and must be pushed after local/CPS scaffold is ready using cps_parse_prompt_config plus cps_build_prompt_update and Dataverse MCP update_record, or scripts/prompt-sync.mjs for headless promotion.",
    "7. Update Requirements/architecture.md directly when it is missing required build detail, portal steps, ordering, or Build State items. Preserve useful existing content.",
    "8. Save a concise runbook to Requirements/build-prep.md.",
    "",
    "## Output Requirements for Requirements/build-prep.md",
    "",
    "Use these headings:",
    "",
    "# Build Preparation Runbook",
    "",
    "## Readiness Verdict",
    "State Ready / Blocked / Ready with manual portal steps.",
    "",
    "## Architecture Corrections Made",
    "List any changes you made to Requirements/architecture.md. If none, say none.",
    "",
    "## Portal Steps Safe Before Build",
    "Ordered list of portal actions the developer can do now. Include exact names, descriptions, auth/run-as settings, and sync expectations.",
    "",
    "## Portal Steps Deferred Until After Dataverse Build",
    "Ordered list of portal actions that must wait for live Dataverse schema or prompt inputs.",
    "",
    "## Dataverse Build Inputs",
    "Tables, columns, relationships, choices, seed data, and verification queries Build must execute. If no Dataverse work is needed, say none.",
    "",
    "## AI Prompt Tool Update Plan",
    "Prompt tools to create in the portal, placeholders to preserve, and post-build Dataverse update method. If no prompt tools are needed, say none.",
    "",
    "## Sync And Build Handoff",
    "Tell the developer exactly when to run Copilot Studio Get Changes, when to run CPSAgentKit Build Agent, when to run Copilot Studio Apply Changes, and when prompt-tool Dataverse updates must happen.",
    "",
    "## Blockers",
    "List missing MCP configuration, missing portal permissions, missing source docs, unresolved architecture conflicts, or DLP/auth risks.",
    "",
    "## Important Rules",
    "",
    "- Do not create Dataverse schema during Prepare for Build; this phase validates and enriches the plan.",
    "- Do not hand-author action YAML for connectors, flows, MCP servers, prompt tools, or connection references.",
    "- Do not edit workflow.json for Power Automate flow behavior; the Power Automate designer is the runtime source of truth.",
    "- Do not claim Build is ready if required Dataverse MCP or portal permissions are missing.",
    "- Do not mark Build State items complete unless the work is actually complete or the runbook explicitly says the item is ready for Build execution.",
  ].join("\n");
}
