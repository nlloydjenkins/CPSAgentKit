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
    "1a. Extract build-time configuration values from Requirements/docs, especially any Build-Time Configuration section or sample placeholders: real email addresses, Teams channels, SharePoint sites/libraries, service accounts, Dataverse publisher prefixes/table names, business hours, routing owners, and audit requirements. Treat sample defaults as suggestions only until the maker confirms or replaces them.",
    "2. Validate the architecture against CPS constraints: child-agent MCP limits, child-owned trigger prohibition, tool-count limits, general knowledge stance, DLP/auth/channel constraints, content moderation, and prompt-tool vs child-agent tradeoffs.",
    "3. Identify scaffold steps that must happen before local YAML can be safely edited: agents, child agents, connected agents, MCP server connections, prompt tools, standard connector actions, Power Automate flows, knowledge sources, autonomous triggers, channel/auth settings, DLP, and content moderation. Classify each child agent as existing YAML, guarded manual scaffold, or portal-first.",
    "   - Guarded manual scaffold is allowed only for simple instruction-only child agents with no tools, connector bindings, MCP servers, knowledge sources, prompt tools, flows, custom auth, or portal-only settings. Use sanitized folder names and require Apply Changes plus portal acceptance.",
    "   - Portal-first remains required for child agents with tools, connector bindings, MCP servers, knowledge sources, prompt tools, flows, custom auth, or portal-only settings.",
    "   - Action/tool scaffolding remains portal-first by default. Experimental manual action scaffolds require explicit developer opt-in or a working reference export, root connectionreferences, connectionReference validation, Apply Changes, Get Changes round-trip, and Activity Map runtime testing.",
    "   - Uploaded-file knowledge must be ingested through the Dataverse/CPS backend path or uploaded manually in the portal. When tenant-aligned API auth is available, create `botcomponent` with `componenttype = 14`, upload bytes to `filedata`, confirm Ready, run Get Changes, and validate Activity Map retrieval. If tenant-aligned API auth is unavailable, keep it as a manual portal upload. Never use local knowledge YAML as the ingestion mechanism.",
    "   - Programmatic Dataverse/CPS Web API work must derive `DataverseEndpoint` and `AccountInfo.TenantId` from `.mcs/conn.json`. A 403 'user is not a member of the organization' means wrong-tenant auth and must be surfaced as a tenant-specific blocker.",
    "   - MCP tools require separate runtime-discovery validation: action YAML exists, portal-visible, portal-enabled, expected subtools discovered, and Activity Map execution. If subtools are missing, use the portal off-refresh-on remediation rather than editing `knownTools` or `operationDetails`.",
    "   - Topic scaffolding is safe for routing, questions, confirmation, variables, and messages. Topic-owned MCP or connector execution nodes require a portal-generated or verified template pattern; otherwise list them as portal-generated follow-up work.",
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
    "## Build-Time Configuration Needed",
    "List only tenant-specific values the maker must provide before Build can safely generate assets. Use sample defaults as suggested values, not fixed facts. If all required values are already specified, say none.",
    "",
    "## Portal Steps Safe Before Build",
    "Ordered list of portal actions the developer can do now. Include exact names, descriptions, auth/run-as settings, and sync expectations.",
    "Do not list guarded manual child-agent scaffolds here unless a portal verification step is required after Apply Changes.",

    "## Guarded Manual Scaffolds",
    "List any simple instruction-only child agents that Build may create locally, including sanitized folder path, componentName, routing description, validation checks, and portal acceptance requirement. Also list any explicitly approved experimental action YAML scaffolds, including root connectionreferences.mcs.yml entries, action file paths, connectionReference logical names, operation IDs, Apply Changes, Get Changes round-trip, and Activity Map validation. If none, say none.",

    "## Programmatic Knowledge Uploads",
    "List uploaded-file knowledge sources that Build must upload via Dataverse/CPS Web API when tenant-aligned auth is available, including owner agent or child agent, source file path, description, expected botcomponent schema name pattern, tenant from .mcs/conn.json, parent/child id resolution, Ready confirmation, Get Changes, local descriptor verification, and Activity Map retrieval test. If API auth is unavailable, move these items to manual portal upload steps. Never list local YAML creation as an upload path.",
    "",
    "## Runtime Discovery And Validation Gates",
    "List MCP subtool discovery checks, exact slash-reference validation against action `modelDisplayName` values, topic execution-node pattern gaps, and each component's current state: locally generated, local diagnostics clean, Apply Changes accepted, portal-visible, portal-enabled, runtime-discovered, Get Changes preserved, or Activity Map validated.",
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
