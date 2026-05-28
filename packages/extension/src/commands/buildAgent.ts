import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { findCpsAgentFolders } from "../services/fileUtils.js";
import {
  composeDataverseChatPrompt,
  detectDataverseMcp,
} from "../services/preBuildGenerator.js";
import { requireWorkspaceRoot, openPromptAndNotify } from "../ui/uiUtils.js";
import { configDirPath } from "../services/config.js";

interface DocumentReference {
  filename: string;
  relativePath: string;
}

async function listMarkdownReferences(
  dir: string,
  relativeDir: string,
): Promise<DocumentReference[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((filename) => filename.endsWith(".md"))
      .sort()
      .map((filename) => ({
        filename,
        relativePath: `${relativeDir}/${filename}`,
      }));
  } catch {
    return [];
  }
}

function formatReferenceList(references: DocumentReference[]): string[] {
  return references.map((doc) => `- ${doc.relativePath}`);
}

function isTemplateSpec(content: string): boolean {
  return (
    content.includes("<!-- Tell GHCP what you need") ||
    content.includes("<!-- Start by describing the business problem") ||
    (/^# Agent Spec/m.test(content) &&
      content.includes(
        "<!-- One paragraph: what does this agent do and why?",
      ) &&
      content.includes("| Document | Description |"))
  );
}

function isTemplateArchitecture(content: string): boolean {
  return (
    content.includes("<!-- GHCP generates this from the spec") ||
    content.includes("### [Agent Name]") ||
    (/^# Agent Architecture/m.test(content) &&
      content.includes(
        "<!-- High-level description of the solution architecture -->",
      ) &&
      content.includes("| Tool | Owner Agent | Purpose |"))
  );
}

async function writeCreatePlanChecklist(root: string): Promise<void> {
  const requirementsDir = path.join(root, "Requirements");
  const checklistPath = path.join(requirementsDir, "build-checklist.md");
  const content = [
    "# Build Checklist",
    "",
    "## Actions",
    "- [ ] Run Agent Workbench: Create Plan.",
    "- [ ] Review Requirements/spec.md and Requirements/architecture.md.",
    "- [ ] Run Agent Workbench: Build Agent again.",
    "",
  ].join("\n");

  await fs.mkdir(requirementsDir, { recursive: true });
  await fs.writeFile(checklistPath, content, "utf-8");

  const doc = await vscode.workspace.openTextDocument(checklistPath);
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function createPlanChecklistAndNotify(root: string): Promise<void> {
  await writeCreatePlanChecklist(root);
  const action = await vscode.window.showInformationMessage(
    "Agent Workbench: Build checklist created. Create Plan, review the plan files, then run Build Agent again.",
    "Create Plan",
  );
  if (action === "Create Plan") {
    await vscode.commands.executeCommand("agentWorkbench.createSpec");
  }
}

/**
 * Build Agent command — reads spec.md + architecture.md + knowledge,
 * composes a staged build prompt, and sends it to Copilot Chat.
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
    await createPlanChecklistAndNotify(root);
    return;
  }

  // Require architecture.md
  const archPath = path.join(root, "Requirements", "architecture.md");
  let architecture: string;
  try {
    architecture = await fs.readFile(archPath, "utf-8");
  } catch {
    await createPlanChecklistAndNotify(root);
    return;
  }

  if (isTemplateSpec(spec) || isTemplateArchitecture(architecture)) {
    await createPlanChecklistAndNotify(root);
    return;
  }

  // List additional requirement docs without inlining their content.
  const docsDir = path.join(root, "Requirements", "docs");
  const requirementsDocs = await listMarkdownReferences(
    docsDir,
    "Requirements/docs",
  );

  // List synced knowledge and best practices from .agent-workbench/ without
  // inlining their content into the generated chat prompt.
  const cpsDir = configDirPath(root);
  const knowledgeFiles = await listMarkdownReferences(
    path.join(cpsDir, "knowledge"),
    ".agent-workbench/knowledge",
  );
  const bestPracticesFiles = await listMarkdownReferences(
    path.join(cpsDir, "bestpractices"),
    ".agent-workbench/bestpractices",
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
      title: "Agent Workbench: Build Agent",
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
    scope.detail === "full"
      ? "Agent Workbench: Build prompt loaded into GitHub Copilot Chat. Press Enter to start the staged build. Copilot will create everything it can locally or through configured APIs first, then checklist only true portal/admin blockers and acceptance gates."
      : "Agent Workbench: Build prompt loaded into GitHub Copilot Chat. Press Enter to continue.",
  );
}

/** Compose the build prompt based on scope */
function composeBuildPrompt(
  scope: string,
  architecture: string,
  agentFolders: string[],
  testOutput: string,
  requirementsDocs: DocumentReference[],
  knowledgeFiles: DocumentReference[],
  bestPracticesFiles: DocumentReference[],
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
          "Read these additional requirement documents before building the agent. Do not rely only on the summaries in spec.md or architecture.md when a source document contains more precise details:",
          "",
          ...formatReferenceList(requirementsDocs),
        ].join("\n")
      : "";

  const knowledgeContext =
    knowledgeFiles.length > 0
      ? [
          "",
          "## CPS Platform Knowledge",
          "",
          "Read the relevant local CPS platform knowledge files before making design or build decisions. Prefer the most relevant files for the current task, and consult constraints/troubleshooting/yaml syntax when editing generated artifacts:",
          "",
          ...formatReferenceList(knowledgeFiles),
        ].join("\n")
      : "";

  const bestPracticesContext =
    bestPracticesFiles.length > 0
      ? [
          "",
          "## CPS Best Practices",
          "",
          "Read these best-practice files as needed and apply them when generating or reviewing agent configuration:",
          "",
          ...formatReferenceList(bestPracticesFiles),
        ].join("\n")
      : "";

  const dataverseBuildContext =
    scope === "full" && dataverseBuildPrompt
      ? [
          "",
          "## Dataverse Table Creation First",
          "",
          "If the architecture uses Dataverse tables that connectors/actions will bind to, create the Dataverse schema before creating connector/action scaffolds or listing any unresolved portal fallback.",
          "Reason: connector action setup needs the target Dataverse tables, columns, and choice definitions to exist before the maker can select them and sync valid action YAML.",
          "Use the Dataverse MCP Server in GitHub Copilot to create the required tables, columns, relationships, choices, and required startup/reference records first. Do not ask the developer to create these tables manually when the Dataverse MCP task is available.",
          "Run this Dataverse MCP task before connector/action scaffolding or any unresolved portal fallback instructions:",
          "",
          "```text",
          dataverseBuildPrompt,
          "```",
          "",
          "After table creation, report the created table logical names, column logical names, relationships, choice integer mappings, and any startup/reference records inserted.",
          "Then use any verified export/API patterns available to create or attach Dataverse connector actions against those live tables. Only tell the developer to create/attach connector actions in the Copilot Studio portal when no verified reference-backed path exists or when tenant-specific connection/auth values are missing. Apply the same rule to agents, prompt tools, knowledge sources, triggers, and settings from the architecture.",
          "For choice/option-set columns, the Dataverse MCP Server requires integer values — passing text labels (e.g. 'High') causes a FormatException. Include the integer mappings (e.g. High=100000002) in connector scaffolds, any deferred portal fallback, later agent instructions, and action modelDescriptions so the agent passes valid values.",
          "After local/reference-backed scaffolding and any required Apply Changes/Get Changes acceptance gate are complete, inspect the synced YAML and use the real logical names in Dataverse action descriptions, OData examples, topic logic, and agent instructions.",
          "Do not report the implementation as complete until the schema, sample data, action descriptions, OData examples, and topic logic are aligned to the synced configuration.",
        ].join("\n")
      : "";

  const base = [
    "You are building a Copilot Studio agent. Read these workspace documents before acting:",
    "",
    "## Primary Documents",
    "",
    "- Requirements/spec.md",
    "- Requirements/architecture.md",
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
    "- When asked to add a new tool, use a verified export/API pattern when one exists for that connector, MCP attachment, or first-party tool. For IT Help Desk builds, the known reference-backed first-party patterns include Dataverse MCP attachment, Office 365 Users `Get my profile (V2)`, Teams `Post message in a chat or channel`, and Outlook `Send an email from a shared mailbox (V2)`. If no verified pattern exists, continue creating every other artifact and checklist only the narrow missing tool-binding or portal-generated-node blocker after the build work is done. Do not invent action YAML from scratch.",
    "",
    "### CRITICAL: Staged Build Protocol",
    "- If Requirements/spec.md or Requirements/architecture.md is missing or still the starter template, do not start a build. First generate both files from Requirements/docs/ so the developer can review and refine them before committing to build work. Build Agent may do this fallback planning step only for missing/template planning files; otherwise, treat reviewed spec and architecture as the build contract.",
    "- Build is action-first and creation-first. Before writing a build checklist or stopping, create every agent, topic, tool/action, knowledge source, schema, seed record, publishing setting, and build artifact that has a verified local YAML, MCP, Dataverse/CPS Web API, or reference-backed export path available in the current workspace. Exception: when the workspace has no cloned/synced Copilot Studio agent folder yet, the checklist is the first-pass bootstrap handoff because there is no local agent surface to edit.",
    "- Treat `Requirements/build-checklist.md` as a persistent build handoff. Create it on the first Build pass when essential portal/admin bootstrap work is required, and update the same file on every later Build pass by removing completed items and adding only newly discovered essential blockers. Do not append duplicate historical checklists.",
    "- In a fresh workspace where the agent has not been cloned/synced into local YAML, checklist only the minimum portal seed needed for Agent Workbench to take over: create the Copilot Studio agent shell, add exactly one representative required tool/connector/MCP action only if needed to generate tenant connection references or action shape, run Get Changes/clone/sync so the agent folder and generated files appear locally, then run Build Agent again. Do not list every planned tool, topic, child agent, or knowledge source when one seed tool is enough to expose the generated bindings.",
    "- Do not use the staged build protocol as a reason to produce only a plan. A plan is useful, but it is not sufficient when safe actions are available.",
    "- Build Agent must do this work itself, not hand it back as manual setup, whenever the required tenant value/auth context and verified path exist. Manual checklist items are only for missing tenant values, missing auth/connection context, missing verified patterns, admin/policy gates, or the explicit Apply Changes/portal inspection/Get Changes/Activity Map acceptance gate.",
    "- Do not tell the developer to create agents, child-agent shells, topic shells, agent instructions, topic descriptions, tool descriptions, settings updates, Build State updates, or Dataverse schema manually when the workspace and configured tools let you create them. Those are Build Agent responsibilities.",
    "- If an artifact is only partially safe to create, create the safe part now. Examples: create a topic shell even if a connector execution node needs a portal-generated example; create a child-agent shell even if child-owned tools must wait for the child cloud component; update existing tool descriptions even if adding a missing tool is blocked by absent connection references.",
    "- Do not make connection-file discovery the first or only build action. First inventory the current agent YAML and architecture, then create every non-action artifact that is safe: Dataverse schema through MCP, topics, instructions, settings updates, knowledge upload when API auth exists, build-state updates, and exact descriptions for any tools already synced in `actions/`.",
    "- Check `actions/`, `connectionreferences.mcs.yml`, `.mcs/conn.json`, exported action YAML, child action YAML, or `.mcs/botdefinition.json` only when you are about to create or attach new Copilot Studio action YAML, or when deciding whether that specific action YAML is blocked. Before declaring a tool/action blocked, search for validated reference-backed patterns only inside the active workspace: `Reference/`, `Requirements/*tool*yaml*findings*.md`, `Requirements/*product*notes*.md`, `Requirements/*implementation*sketch*.md`, root `connectionreferences.mcs.yml`, exported `actions/*.mcs.yml`, and child `agents/*/actions/*.mcs.yml`. Use only files under the active workspace root during a Build Agent run. Treat discovered validated findings as first-class build inputs.",
    "- Safe actions include: reading current YAML, updating existing safe YAML fields, creating/reconciling Dataverse schema through Dataverse MCP when configured, inserting required seed/reference data, updating prompt tool instructions through Dataverse MCP when the prompt tools already exist, programmatically uploading knowledge when tenant-aligned API auth exists, scaffolding all deterministic topic YAML from architecture, scaffolding top-level and child-agent YAML shells, creating all reference-backed tool/action YAML, attaching knowledge sources through backend/API or verified export-shaped paths, configuring publishing metadata from verified patterns, refining Requirements/spec.md or Requirements/architecture.md when the source docs justify it, generating exact deferred portal/admin blocker instructions only for true blockers, and updating Build State.",
    "- Reference-backed portal artifact creation is a required provisional build action when a known-good export/API pattern exists for the target artifact and tenant-specific connection/auth values are available. This includes connector action YAML, MCP attachment YAML, direct uploaded-file knowledge, SharePoint knowledge attachment, child-owned knowledge, child-owned connector actions, and Teams publishing metadata when the pattern has already survived Apply Changes, portal inspection, Get Changes, and runtime validation in this product's reference builds. Exception: child-owned artifacts must follow the two-pass child ParentId rule below.",
    "- The IT Help Desk reference build has validated these as Build Agent actions when tenant-specific connection/auth values are available: scaffold `Knowledge Specialist` and `Notification Specialist` child agents, attach `Microsoft Dataverse MCP Server` to the parent, add Office 365 Users `Get my profile (V2)` to the parent, stage Teams `Post message in a chat or channel` and Outlook `Send an email from a shared mailbox (V2)` for `Notification Specialist` until the child exists in the cloud, configure Teams publishing metadata, and add approved knowledge by a verified backend/API path. Do not list these as manual creation tasks unless the specific required tenant value, auth context, connection reference logical name, verified pattern, or required child cloud component is missing.",
    "- The reusable IT Help Desk action template consists of root `connectionreferences.mcs.yml`, parent actions `MicrosoftDataverse-MicrosoftDataverseMCPServer.mcs.yml` and `Office365Users-GetmyprofileV2.mcs.yml`, and staged child actions `MicrosoftTeams-Postmessageinachatorchannel.mcs.yml.staged` and `Office365Outlook-SendanemailV2.mcs.yml.staged` under the child actions folder until `Notification Specialist` exists in the cloud. Known operation IDs are `InvokeMCP`, `MyProfile_V2`, `PostMessageToConversation`, and `SendEmailV2`. Only create active or staged action files when the workspace contains the real tenant connection reference logical names in root `connectionreferences.mcs.yml`, exported action YAML, child action YAML, or `.mcs/botdefinition.json`. Never invent `action.connectionReference` values from connector IDs or examples. Parameterize agent folder names, Dataverse table/choice mappings, shared mailbox and Teams channel wording, and exact `modelDisplayName` values used in slash references.",
    "- CRITICAL connection binding rule: a validated action shape and operation ID are not enough to create new action YAML. This rule applies at the point of creating or attaching connector/MCP action YAML; it must not prevent unrelated Build work. If a required tool already exists in synced `actions/` YAML, use the existing file, update only safe fields such as `modelDescription`, and reference its exact `modelDisplayName`. If the tool is missing and you need to create active `.mcs.yml` or staged `.mcs.yml.staged` action files, first verify the tenant-specific `action.connectionReference` logical name and matching root `connectionreferences.mcs.yml` entry exist for each connector/MCP tool. If the active workspace has no root `connectionreferences.mcs.yml`, no exported action YAML, no child action YAML, and no connection-reference logical names in `.mcs/botdefinition.json`, do not create tool YAML. Complete all unrelated safe build work first, then checklist the smallest blocker: create or sync one representative connector/MCP seed that exposes the real connection reference values, not every planned tool.",
    "- CRITICAL child ParentId rule: never place active child-owned action YAML, knowledge YAML, prompt-tool YAML, or other child-owned `.mcs.yml` artifacts under `agents/<Child>/` before that child agent exists in the cloud. Copilot Studio Apply Changes can fail with `ParentId does not exist on cloud: <schema>.agent.<Child>` because it tries to create child-owned tools before the child botcomponent exists. First pass: create only the child `agent.mcs.yml`, parent-owned tools, root connection references, topics, and settings. Stage child-owned action files as `.mcs.yml.staged` or in a non-applied staging location. After Apply Changes succeeds and Get Changes confirms the child exists, rename staged child-owned files back to `.mcs.yml`, then run a second Apply Changes/Get Changes pass.",
    "- Portal-owned actions remain checklist items only when no verified export/API path exists, tenant-specific connection/auth values are missing, or the remaining step is the required manual acceptance gate. Do not leave agents, topic shells, connector actions, MCP attachment, direct knowledge upload, SharePoint knowledge attachment, child-owned tools, child-owned knowledge, or Teams publishing as manual steps just because they are portal-owned if a verified local/API/reference-backed path is available. Never checklist `create the topics` or `create the agent` when you can scaffold their YAML.",
    "- If Dataverse tables are required for connector/action setup and Dataverse MCP is configured, create or reconcile the schema before connector/action scaffolding or any deferred portal fallback. Connectors cannot be properly created against tables that do not exist yet.",
    "- If required portal-generated YAML is missing and no verified reference-backed or API path exists, do not invent unsafe files. Create every other local/API/reference-backed artifact first, then list only the unresolved blocker or acceptance gate in `Requirements/build-checklist.md`.",
    "- End the response with a build summary, the remaining `Requirements/build-checklist.md` items, and a clear next step such as: apply/inspect scaffolded changes, run Get Changes, then run Build Agent again. Use portal creation wording only for artifacts with no verified local/API/reference-backed path.",
    "- After every implementation pass, validate every /ToolName reference, action modelDescription, settings flag, and Build State item before reporting completion.",
    "",
    "### CRITICAL: Build Checklist Document",
    "- `Requirements/build-checklist.md` is the final must-do list after Build has created every artifact it can through local YAML, MCP, Dataverse/CPS Web API, or verified reference-backed export paths. Do not create or update it as the first or only build action unless literally no build action is available.",
    "- Whenever the build still requires essential deferred admin/portal action, missing build-time configuration, expected synced YAML, or portal-generated artifacts after all local/API/reference-backed actions are complete, create or update `Requirements/build-checklist.md` before ending your response.",
    "- Never put an item in `Requirements/build-checklist.md` if Build Agent can perform that action itself with the current workspace files and configured tools. Perform it, then summarize it as completed instead.",
    "- The checklist is a required build artifact, but it must be a simple action list, not a validation log, status report, troubleshooting checklist, runbook, or explanation of why work is blocked.",
    "- The checklist is persistent across Build passes. If it already exists, update it in place: remove completed bootstrap items, keep still-blocking essentials, and add only the next smallest blockers. Do not produce a second checklist or preserve obsolete items as history.",
    "- Use these headings exactly:",
    "  # Build Checklist",
    "  ## Actions",
    "- Every checklist item must be a checkbox bullet using `- [ ]` followed by one short imperative instruction.",
    "- Do not use labels or prefixes such as `Deferred portal/admin action:`, `Needs user value:`, `Programmatic knowledge upload:`, `Manual tenant/admin prerequisite:`, `Blocker:`, or `Build Agent after sync:`.",
    "- Do not create separate sections for blockers, configuration, resume instructions, background, reasons, or completed work. Convert each blocker or missing value into a direct action in `## Actions`.",
    "- Keep each item under 12 words when possible. Use plain verbs: `Update`, `Add`, `Provide`, `Run`, `Upload`, `Sync`, `Enable`, `Set`.",
    "- Keep one action per item. Do not combine multiple actions with semicolons, `and then`, or long explanatory clauses.",
    "- Only list incomplete actions that are essential before the agent can run. Do NOT list completed work, expected files, general verification, Activity Map checks, YAML hygiene checks, or troubleshooting probes.",
    "- Keep the checklist compact: target 3-8 items, and often fewer for a first pass.",
    "- For connection-reference blockers, write direct connection actions, for example: `- [ ] Update Dataverse connection.`, `- [ ] Update Office 365 Users connection.`, `- [ ] Update Teams connection.`, `- [ ] Update Outlook connection.`, `- [ ] Run Copilot Studio: Get Changes.`",
    "- For missing build-time configuration, write direct value actions, for example: `- [ ] Provide IT support shared mailbox.`, `- [ ] Provide Teams escalation channel.`, `- [ ] Confirm office location choices.`",
    "- For first-pass bootstrap with no cloned/synced agent folder, the checklist should usually contain only: `- [ ] Create Copilot Studio agent shell.`, `- [ ] Add one required connector or MCP tool.`, `- [ ] Run Copilot Studio: Get Changes.`, `- [ ] Run Agent Workbench: Build Agent again.`",
    "- The final item should usually be `- [ ] Run Agent Workbench: Build Agent again.` unless the remaining actions complete the build without another pass.",
    "- Put diagnostic checks and validation guidance in troubleshooting notes or the final response only when something fails. Do not put routine 'verify/check/confirm' items in the checklist unless they are the actual required setup action.",
    "- Keep `Requirements/architecture.md` Build State aligned at a high level, but do not mirror every diagnostic gate into `Requirements/build-checklist.md`.",
    "",
    "### Build Rules",
    '- If the agent has tools (MCP servers, connectors, flows): instructions MUST say "Always use [exact tool name] to answer questions. Do not use general knowledge when the tool can provide the answer."',
    "- If requirements docs include a Build-Time Configuration section or obvious sample placeholders (emails, Teams channels, SharePoint libraries, service accounts, Dataverse prefixes, business hours), collect those values during Build. Use defaults as suggestions only; do not bake sample tenant details into generated assets without confirmation.",
    "- Missing build-time configuration is not a global stop condition. Do all build work that does not depend on those values first: inspect existing YAML, create or reconcile Dataverse schema that uses confirmed or neutral logical names, draft prompt/tool instructions with placeholders where needed, scaffold all deterministic topic YAML, create child-agent shells, update existing tools, create reference-backed tools only when real tenant connection reference logical names are known, and produce exact deferred portal/admin blocker steps only for true blockers. Block only the specific action that genuinely requires the missing value.",
    "- If tenant-specific values are missing, ask for the smallest set needed for the next blocked action in the chat response and write those same items to `Requirements/build-checklist.md` only after completing other safe work. Do not stop after writing the checklist when other safe build actions remain.",
    "- Reference tools by exact name using /ToolName syntax in instructions",
    "- After every Get Changes round-trip, collect all action YAML `modelDisplayName` values and validate every `/ToolName` reference in agent instructions, child instructions, and topics against that exact set.",
    '- Consider recommending "Use general knowledge" be DISABLED if tools cover the full domain',
    "- If CPS agent YAML files exist in the workspace after local scaffolding, Apply Changes, or Get Changes, perform the implementation by editing those files directly. Do NOT answer with instructions telling the developer to paste content into Overview pages, topic editors, or tool descriptions at that stage.",
    "- Do NOT guess action YAML for new tools. When a verified export/API pattern exists for the exact connector, MCP attachment, or first-party tool and real tenant-specific connection reference logical names are available, use that reference-backed path provisionally. The validated IT Help Desk first-party patterns include Dataverse MCP attachment, Office 365 Users `Get my profile (V2)`, Teams `Post message in a chat or channel`, and Outlook `Send an email from a shared mailbox (V2)`. If connection reference logical names are missing, complete every other local/API/reference-backed action, then list only that specific missing tool binding as a deferred blocker requiring connector sync or a real root `connectionreferences.mcs.yml`. Do not create placeholder action YAML.",
    "- If the active workspace lacks action scaffolds, do not stop there. Search current-workspace reference artifacts and findings files first; if they contain a validated reference-backed pattern for the exact tool, create the local YAML before writing the checklist. Use only files under the active workspace root. The checklist should then say `Apply Changes and inspect the scaffolded tools`, not `create the tools manually`.",
    "- Reference-backed action scaffolding is allowed when the developer explicitly opts in, provides a known-good reference export, or the product has a validated reference build for that exact first-party pattern, AND the active workspace contains real tenant connection reference logical names. Use reference-shaped `TaskDialog` YAML plus a root `connectionreferences.mcs.yml`; every action must have inline `modelDisplayName`, inline `modelDescription`, `action.kind`, `action.connectionReference`, and portal/export-style operation metadata such as `InvokeMCP`, `MyProfile_V2`, `PostMessageToConversation`, or `SendEmailV2` only when verified by the reference. Treat the scaffold as provisional until Apply Changes succeeds, Get Changes preserves or portal-corrects it, Copilot Studio shows the tool enabled with no errors, and Activity Map testing proves runtime execution.",
    "- Uploaded-file knowledge sources MUST be ingested through Copilot Studio/Dataverse backend APIs or uploaded manually in the portal. NEVER create local knowledge YAML as the ingestion mechanism. When an authenticated Dataverse/CPS Web API path is available and tenant-aligned to `.mcs/conn.json`, create a `botcomponent` row with `componenttype = 14`, upload bytes to the `filedata` file column, wait for Ready/processing, run Get Changes, and validate retrieval in Activity Map. For child-owned files, bind `ParentBotComponentId@odata.bind` to the child botcomponent id. If the API/auth path is unavailable, complete every other local/API/reference-backed action first, then list uploaded-file knowledge as a deferred manual portal upload action.",
    "- Before any programmatic Dataverse/CPS Web API operation, read `.mcs/conn.json`, use `DataverseEndpoint`, and acquire auth in `AccountInfo.TenantId`. If Dataverse returns `403 Forbidden: The user is not a member of the organization.`, diagnose wrong-tenant auth and stop with a tenant-specific remediation instead of treating it as a schema or upload failure.",
    "- MCP subtools are portal/runtime-discovered and may not appear in exported YAML. Do NOT hand-author `knownTools` or mutate `action.operationDetails`. Validate MCP through separate gates: action file exists, tool portal-visible, tool portal-enabled, expected subtools discovered, and Activity Map runtime execution succeeds. If subtools are missing, instruct the maker to turn the MCP tool off, refresh tools, then turn it back on, then run Get Changes and retest.",
    "- Create all deterministic topic YAML declared by the architecture for routing, questions, confirmation, variables, and messages when it follows exported shapes. Add topic-owned MCP or connector execution nodes when a portal-generated target-environment example or verified template has survived Apply Changes, Get Changes, and Activity Map testing. Without that verified execution-node pattern, still create the topic shell and checklist only the missing execution node pattern or acceptance gate. Do not tell the developer to create the whole topic manually.",
    "- Create child-agent YAML when no portal-generated child folder exists and a verified child-agent shape exists. Use `kind: AgentDialog`, `beginDialog.kind: OnToolSelected`, a strong routing `beginDialog.description`, and `settings.instructions`. Use a sanitized folder name with no spaces or special characters, such as `agents/KnowledgeSpecialist/agent.mcs.yml`, while keeping the display name in `mcs.metadata.componentName`. Do not activate child-owned tools, knowledge, prompt tools, or settings in the same Apply Changes pass as a newly scaffolded child; stage them as `.mcs.yml.staged` or defer API creation until Get Changes confirms the child cloud component exists. Validate YAML parsing and CPS diagnostics, then require Apply Changes and portal acceptance before marking the child agent fully accepted.",
    "- Portal-first is only the fallback for child-owned tools, connector bindings, MCP servers, knowledge sources, prompt tools, flows, custom auth, or portal-only settings when no verified export/API pattern exists for the exact child-owned artifact. Do not manually invent generated structures.",
    "- Child agents use a different YAML shape from top-level agents. A child agent file typically has `kind: AgentDialog` and its instructions live at `settings.instructions` inside `agents/*/agent.mcs.yml`.",
    "- When updating child agents, edit `settings.instructions` in the child agent YAML directly. Do NOT treat child-agent instructions as top-level `instructions:` fields or as manual Overview-page paste blocks.",
    "- In Copilot Studio, implement parent orchestration through the parent agent instructions plus Topics, child agents, tools, and triggers. Do NOT describe this as a workflow to scaffold.",
    "- If the parent needs deterministic status lookup or a one-question clarification loop, implement that through one or more parent Topics rather than inventing a workflow concept.",
    '- Write tool descriptions following this pattern: "[What it does]. Call when [specific intents]. Requires [inputs]. Do NOT use for [exclusions]."',
    "- Topic descriptions must tell the orchestrator exactly when to invoke them and when NOT to",
    "- Agent instructions have an 8,000-character hard limit. Quality may degrade with dense instructions before this limit. For autonomous pipelines with retry logic, keep instructions under ~5,500 characters. If instructions exceed ~3,000 characters, consider decomposing into child agents, prompt tools, or knowledge files.",
    "- If something truly needs manual portal creation after all local/API/reference-backed paths are exhausted, list the exact reason Build could not create it, the exact steps and settings, and the smallest follow-up needed. Keep these portal actions last and separate from work Build already completed.",
    "- When generating modelDescription values, validate that no description exceeds 1,024 characters. CPS silently truncates longer descriptions.",
    "- If an agent has more than 25 action YAML files (tools), warn that orchestrator routing quality degrades beyond 25-30 tools. Consider splitting into child agents to partition the tool set.",
    "- When generating agent instructions containing single curly braces { } that are not Power Fx {System.Bot.Components...} references and not doubled {{ }} escape sequences, warn that CPS evaluates single curly braces as Power Fx expressions. Use {{ }} for literal braces or key=value notation for examples.",
    "- ⚠️ Tools prohibited by instruction text (e.g. 'Do not call /ToolName') should be disabled in the CPS portal instead. Instruction-level prohibition is not reliable — the orchestrator may still select them based on description matching. Flag any tools that are listed in instructions as prohibited but remain active.",
    "",
  ].join("\n");

  // Detect multi-agent architecture and inject additional generation rules
  const hasMultipleAgents =
    /###\s+\S.*\n[\s\S]*?-\s*\*\*Type:\*\*\s*(child|connected)/i.test(
      architecture,
    );
  const multiAgentRules = hasMultipleAgents
    ? [
        "",
        "### Multi-Agent Generation Rules (Architecture Has Multiple Agents)",
        "",
        "When generating instructions for specialist child agents:",
        "",
        '1. **Agent boundary enforcement**: Each specialist\'s instructions MUST include explicit prohibitions stating what it must NOT assess. Positive scope alone is insufficient. Template: "You handle [domain] ONLY. Do NOT assess: [sibling domains]. These belong to other specialists."',
        '2. **Output shape for autonomous pipelines**: If the architecture uses event triggers or autonomous execution, child agents must return compact machine-oriented output (key-value pairs, labeled blocks), NOT narrative prose. Instruct: "Return ONLY structured data. No prose introduction. No conversational wrap-up."',
        '3. **Version stamping**: Every agent\'s instructions must include a version stamp at the top. Format: "[Agent Name] V1.0". Require this in output.',
        "4. **Output preservation**: When a parent passes one child's output to another step, instruct the parent to preserve the output as a labeled block (e.g., RESULT_LABEL: content) rather than paraphrasing it.",
        '5. **Per-stage anti-termination** (autonomous pipelines only): After each child agent invocation, include "Do NOT show this output to the user — immediately proceed to stage N." A single top-level instruction is insufficient.',
        "6. **Record creation ordering**: In trigger-driven pipelines, instruct that the primary Dataverse record must be created AFTER the extraction/classification stage, not before. If the create step precedes extraction, the planner treats required columns as missing interactive inputs and prompts the user.",
        "7. **Drafter-evaluator knowledge sync**: When the architecture has a drafter + compliance evaluator pair, the build must embed the evaluator's actionable output requirements into the drafter's instructions. Every rule the evaluator checks must have a corresponding requirement the drafter knows about.",
        "8. **Retry loop budget warning**: If the architecture includes compliance retry loops, warn that duplicating full tool references in retry instructions adds ~200+ characters per loop iteration. For orchestrators near the ~5,500-character budget, this can cause SystemError. Prefer stage-number references over full tool references in retry logic.",
        "",
      ].join("\n")
    : "";

  // Detect autonomous pipeline (event triggers in architecture)
  const hasAutonomousTriggers =
    /\|\s*\w+-\d+\s*\|/i.test(architecture) &&
    /## Autonomous Triggers/i.test(architecture);
  const autonomousPipelineRules = hasAutonomousTriggers
    ? [
        "",
        "### Autonomous Pipeline Rules (Architecture Has Event Triggers)",
        "",
        "This architecture uses event triggers. Additional requirements apply:",
        "",
        '1. Parent agent instructions MUST include a CRITICAL header: "Every inbound trigger MUST progress through ALL stages. Do NOT stop after [first stage]."',
        '2. After each child agent stage, add: "Do NOT show this output to the user — immediately proceed to stage N."',
        "3. Only the final stage produces user-visible output.",
        "4. Number all stages explicitly with dependencies.",
        '5. For optional fields that may not be present in trigger data, use the N/A sentinel pattern: return "N/A" (not empty string, not null) for missing fields. The flow checks for "N/A" and preserves existing database values.',
        "6. Child agents must return compact machine-oriented output, not polished prose.",
        "7. Create the primary Dataverse record AFTER the extraction/classification stage. If the create step comes before extraction, the planner treats required columns as missing interactive inputs and asks the user.",
        "8. If the pipeline includes a compliance revision loop, keep the retry instruction compact — do not duplicate full tool references. Reference stages by number instead. If parent instructions exceed ~5,500 characters including retry logic, test for SystemError on simple inputs before publishing.",
        "",
      ].join("\n")
    : "";

  switch (scope) {
    case "full":
      return (
        base +
        multiAgentRules +
        autonomousPipelineRules +
        [
          "## Task: Full Build (Create Local/API Artifacts → Short Action Checklist)",
          "",
          "Run this as an action-first staged build. In the current response, create every artifact you can before writing or updating `Requirements/build-checklist.md`: agents, topics, tools/actions, knowledge sources, Dataverse schema, seed data, publishing metadata, and build artifacts. Do not stop at planning when you can create/reconcile Dataverse schema, update existing safe YAML fields, scaffold deterministic topic YAML, provision direct uploaded-file knowledge, attach SharePoint knowledge through a verified backend/API or export-shaped path, create reference-backed connector/MCP action YAML, configure Teams publishing metadata from a verified pattern, or update build artifacts. Do not hand-author portal-owned generated structures when no verified export/API pattern exists, such as prompt tool YAML, trigger YAML, or unverified execution nodes.",
          "",
          "### Stage 1 — Complete implementation plan",
          "",
          "From spec.md and architecture.md, produce a concise but complete plan, then execute every buildable part of it before writing the final checklist. Cover:",
          "0. Build-time configuration — tenant-specific values from Requirements/docs to confirm or replace before tenant-bound assets are finalized: email addresses, Teams channels, SharePoint locations, service accounts, Dataverse prefixes/table names, routing owners, business hours, and audit requirements. Do not let unresolved values block unrelated safe work.",
          "1. Agent inventory — every parent, child, or connected agent to create, with exact names, purpose, and creation path: existing YAML, guarded child scaffold, or verified export/API pattern. Use unresolved portal fallback for agents only when the needed artifact is genuinely not representable by a verified YAML/API path; do not use it for ordinary agent shells or instructions.",
          "2. Tool inventory — every connector, MCP server, prompt tool, flow, or existing tool to add, with exact display names and creation path: existing YAML, MCP/API path, reference-backed YAML scaffold, or a narrowly scoped unresolved binding/generated-node blocker only when no verified path exists.",
          "3. Topic inventory — every custom/system topic to create or update and why it exists.",
          "4. Knowledge inventory — sources to attach or upload, descriptions to use, routing intent, owner agent, and creation path: existing YAML, programmatic uploaded-file knowledge via Dataverse botcomponent/filedata, verified backend/API/export-shaped attachment, or unresolved portal fallback only when no verified path exists.",
          "5. Settings — generative orchestration, general knowledge, web browsing, semantic search, file analysis, auth, content moderation, and channel settings.",
          "6. Remaining user actions — exact portal, admin, connection, sync, or value steps that remain only after all local/API/reference-backed build work is complete.",
          "7. Sync/acceptance dependency — the minimum Apply Changes, portal inspection, Get Changes, or generated artifact acceptance gate needed before the next local implementation pass can continue.",
          "8. Validation gates — keep these in your reasoning and final notes, but do not expand them into `Requirements/build-checklist.md` unless they are required setup actions.",
          "",
          ...(dataverseBuildPrompt
            ? [
                "### Stage 1a — Dataverse MCP schema creation",
                "",
                "Before connector/action scaffolding or unresolved portal fallback, use the Dataverse MCP Server to create the required tables, columns, relationships, choices, and required startup/reference data from the architecture.",
                "Do this before creating Dataverse connector/action YAML or listing unresolved portal fallback, because those actions must bind to existing tables and columns.",
                "After creation, list the exact table logical names, column logical names, relationship names, and choice integer mappings Build used or must use in any remaining connector/action scaffolds.",
                "",
              ]
            : []),
          "### Stage 2 — Create every buildable artifact, then write a short action checklist",
          "",
          "Before listing remaining user actions, create every artifact available in this workspace and through configured tools or verified reference-backed patterns. Agents, child-agent shells, topic shells, instructions, descriptions, settings updates, Dataverse schema, seed data, and existing tool descriptions must be created or updated before the checklist. Then write only the exact remaining user actions. Include:",
          "- Do not begin Stage 2 by hunting for connection files. Begin by inventorying the current agent YAML and creating buildable non-action artifacts. Only when a required new connector/MCP action is missing should you proactively search active-workspace reference folders and findings files for validated tool patterns: `Reference/`, `Requirements/*tool*yaml*findings*.md`, `Requirements/*product*notes*.md`, `Requirements/*implementation*sketch*.md`, root `connectionreferences.mcs.yml`, exported `actions/*.mcs.yml`, and child `agents/*/actions/*.mcs.yml`. Use only files under the active workspace root during a Build Agent run. Use validated findings as build inputs.",
          "- If build-time configuration values are missing or sample defaults need confirmation, ask for those values in the chat response and record each missing value as a short checkbox action in `Requirements/build-checklist.md`. Continue with safe work that does not depend on those values. Do not hard-code sample email addresses, Teams channels, service accounts, SharePoint URLs, or Dataverse prefixes as if they were tenant facts.",
          "- Create/attach every agent with exact name and role. Top-level instructions and existing agent YAML updates are local Build work. When no portal-generated child folder exists and a verified child-agent shape is available, scaffold `agents/<SafeFolderName>/agent.mcs.yml` locally, then require Apply Changes and portal acceptance before any child-owned artifacts become active `.mcs.yml` files. For the IT Help Desk reference build, `Knowledge Specialist` and `Notification Specialist` are known guarded child-agent scaffolds; create them before writing a checklist unless the scaffold already failed validation.",
          "- Create/attach every connector/action, MCP server, prompt tool, Power Automate flow, knowledge source, and trigger that has a verified local YAML, MCP, Dataverse/CPS Web API, or reference-backed export path and the real tenant binding values required by that path. Portal-first is the fallback only for the specific missing generated action, binding, prompt-tool, trigger, flow, or auth artifact when no verified reference/API path exists or tenant connection references are missing; it is never a reason to defer agents, topic shells, instructions, descriptions, settings, Dataverse schema, or existing tool updates. Uploaded-file knowledge must be ingested through Dataverse `botcomponent` + `filedata` when tenant-aligned API auth is available; SharePoint knowledge must use a verified backend/API or export-shaped path when tenant site/library values are available. Otherwise ask only for the missing tenant value or auth path, not for the maker to recreate the artifact by hand. Do not create local knowledge YAML for ingestion. Use reference-backed action scaffolding when a working export pattern exists and root `connectionreferences.mcs.yml` or exported YAML provides the real connection reference logical names, including round-trip/runtime validation gates. For the IT Help Desk reference build, Dataverse MCP attachment, Office 365 Users `Get my profile (V2)`, and Teams publishing metadata are known reference-backed patterns, but create their action YAML only when tenant connection references are known. Stage child-owned Teams `Post message in a chat or channel` and Outlook `Send an email from a shared mailbox (V2)` as `.mcs.yml.staged` only when their real connection references are known and until Get Changes confirms `Notification Specialist` exists in the cloud; only then rename them to `.mcs.yml` for the second Apply Changes pass. For MCP tools, include subtool discovery validation and the off-refresh-on portal remediation if subtools are missing.",
          "- When using the IT Help Desk tool template, create or parameterize root `connectionreferences.mcs.yml`, parent actions `MicrosoftDataverse-MicrosoftDataverseMCPServer.mcs.yml` and `Office365Users-GetmyprofileV2.mcs.yml`, and staged child actions `MicrosoftTeams-Postmessageinachatorchannel.mcs.yml.staged` and `Office365Outlook-SendanemailV2.mcs.yml.staged` only when the real connection reference logical names are available. Preserve verified operation IDs: `InvokeMCP`, `MyProfile_V2`, `PostMessageToConversation`, and `SendEmailV2`. Rename staged child actions to `.mcs.yml` only after Apply Changes/Get Changes confirms the child exists in the cloud.",
          "- For Dataverse connector actions, create/attach them only after Dataverse MCP schema creation is complete, and bind them to the real tables created in Stage 1a.",
          "- Use standard connector action names. Do not ask the developer to rename standard connector actions to business-specific function names.",
          "- Specify authentication/run-as choices and any service-account or delegated identity requirements.",
          "- Specify content moderation and DLP/channel settings that are genuinely portal-only only after all local/API/reference-backed work is done.",
          "- Tell the developer to run Copilot Studio Apply Changes/Get Changes only after Build has created every local/API/reference-backed artifact available, so generated or portal-corrected YAML appears locally for the next pass.",
          "- Save only short imperative checkbox actions to `Requirements/build-checklist.md` after creating every buildable artifact. Do not include completed work, expected-file inventories, reasons, classifications, routine verification items, troubleshooting probes, or broad validation checklists.",
          "",
          "End Stage 2 with a short build summary and this next step:",
          "Complete the checklist actions, run Copilot Studio Get Changes when listed, then run Build Agent again.",
          "",
          "### Stage 3 — Implementation after developer replies DONE",
          "",
          "After the developer replies DONE, read the synced YAML files and generate/update ALL of the following for each agent in the architecture:",
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
          "4a. **Connector action input descriptions** — for every action with AutomaticTaskInput entries, generate per-input descriptions with value source, expected format, and 'Never ask the user' for autonomous pipelines. Include choice column integer mappings. Flag dynamic schema connectors (zero declared inputs) for portal wiring. Flag system fields and primary keys that should not be dynamic.",
          "5. **System topic customisation** — ConversationStart (greeting listing agent capabilities from architecture), Fallback (domain-specific re-prompting with capability guidance), Escalation (helpdesk contact + escalation logging from architecture), OnError (timestamp, test/prod branching, telemetry, CancelAllDialogs)",
          "6. **Trigger descriptions** — for each autonomous trigger in the architecture's trigger table, replace the generic description with the architecture-specific trigger definition (e.g. AT-001 Daily Operations Scan)",
          "7. **Settings coherence** — validate settings.mcs.yml against architecture: useModelKnowledge, webBrowsing, isSemanticSearchEnabled, content moderation level. Flag any mismatches.",
          "8. **Remaining portal/admin actions** — anything that still must be configured in the CPS portal UI after all local/API/reference-backed paths are exhausted. Write these as short checklist actions. Explicitly flag content moderation as portal-only in the final notes, not as a verbose checklist explanation.",
          "9. **Settings coherence (mandatory)** — After generating all agent config, validate settings.mcs.yml against the architecture spec. Check: useModelKnowledge, webBrowsing, isSemanticSearchEnabled, isFileAnalysisEnabled, optInUseLatestModels vs modelNameHint, authenticationMode, GenerativeActionsEnabled. Flag portal defaults that contradict the architecture. If useModelKnowledge is false, note that follow-up clarifying questions are disabled.",
          "",
          "If CPS agent YAML files exist in the workspace after local scaffolding, Apply Changes, or Get Changes, modify them directly and report the file changes you made. If required generated runtime YAML files are still missing after reference discovery and no verified path exists, continue with every local/API/reference-backed artifact that remains possible, then identify only the unresolved blocker or acceptance gate instead of inventing files.",
          "Exception: if any missing artifact is a child agent and a verified child-agent YAML shape exists, create the guarded manual child-agent scaffold locally using a sanitized folder name and the `AgentDialog` shape. Treat it as provisional until Apply Changes and portal acceptance are verified. For the IT Help Desk reference build, this includes `Knowledge Specialist` and `Notification Specialist`.",
          "Exception: if the developer explicitly opted into reference-backed action scaffolding, supplied a working reference export, or the product has a validated reference build for the exact first-party pattern, create reference-shaped `TaskDialog` action YAML and root `connectionreferences.mcs.yml`. Treat every scaffolded action as provisional until Apply Changes, Get Changes round-trip, portal enabled/no-error status, and Activity Map runtime execution are verified. For the IT Help Desk reference build, this includes Dataverse MCP attachment and Office 365 Users `Get my profile (V2)` as active parent-owned actions in the first pass, with child-owned Teams `Post message in a chat or channel` and Outlook `Send an email from a shared mailbox (V2)` staged until the child exists in the cloud.",
          "If these actions are created from a validated reference pattern, the remaining checklist item is the acceptance gate: Apply Changes, inspect the scaffolded tools in Copilot Studio, run Get Changes, validate MCP subtool discovery, and test in Activity Map. Do not phrase that checklist item as manual tool creation.",
          "Exception: if uploaded-file knowledge is required and you have a tenant-aligned Dataverse/CPS Web API auth path from `.mcs/conn.json`, you must upload the file by creating a `botcomponent` row with `componenttype = 14` and uploading raw bytes to the `filedata` column. Do not create local knowledge YAML as the ingestion mechanism. After upload, require Ready/processing confirmation, Get Changes, local descriptor verification, and Activity Map retrieval testing. If the auth path is unavailable, complete every other local/API/reference-backed action first, then require manual portal upload rather than fabricating YAML.",
          "When required YAML files or configuration values are still missing, create or update `Requirements/build-checklist.md` with only short checkbox actions before reporting the blocker.",
          "Do not return a plan that tells the developer to paste child-agent instruction blocks into Overview pages when those child-agent YAML files already exist in the workspace.",
          "When you find a child agent with YAML shaped like `kind: AgentDialog` plus `settings.instructions`, update that `settings.instructions` field directly.",
          "If the parent needs deterministic status lookup or a one-question clarification loop, create or update the relevant parent Topic(s) and wire that logic there. Do not describe this as a workflow to scaffold.",
          "Create all declared topics. If a topic needs MCP or connector execution nodes and no safe portal-generated pattern exists in the synced files, scaffold the routing/collection/confirmation/message portions and list only the missing execution-node pattern or portal-generated node as an essential action if it blocks a runnable agent. Do not checklist topic creation itself.",
          "After generating, validate that every /ToolName reference in instructions maps to an actual action YAML file with a matching modelDisplayName.",
          "For MCP tools, validate runtime-discovered subtools separately from portal-enabled status; if missing, require the off-refresh-on workaround and Activity Map retest before marking complete.",
          "After generating, update the Build State checklist in architecture.md.",
        ].join("\n")
      );

    case "instructions":
      return (
        base +
        multiAgentRules +
        autonomousPipelineRules +
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
        multiAgentRules +
        autonomousPipelineRules +
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
          "",
          "### Connector Action Input Descriptions",
          "",
          "For every action YAML with `AutomaticTaskInput` entries, generate or improve the input description for each dynamic input:",
          "",
          '1. State the **value source**: "from the extraction agent output", "from the trigger context", "the reference number created in step N"',
          '2. State the **expected format**: "text", "integer — see choice mappings below", "GUID"',
          '3. For autonomous pipelines, append: "Never ask the user for this value."',
          '4. For choice/option-set columns, include integer mappings: "Status: New=100000000, In Progress=100000001"',
          '5. For text columns with length limits, add truncation guidance: "First 900 characters only. Truncate if longer."',
          "6. Flag any actions with zero AutomaticTaskInput/ManualTaskInput entries (beyond organization/entityName) — these are dynamic schema connectors that require portal-side input wiring.",
          "",
          "System fields (Import Sequence Number, Owner, Status Reason, Time Zone Rule Version, UTC Conversion, Return Full Metadata) must never be dynamic inputs. Flag or set to custom values.",
          "Primary key / unique identifier fields must use `GUID()` as a custom value, not dynamic input.",
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
