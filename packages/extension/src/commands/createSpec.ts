import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { buildCpsGuidancePack } from "../services/cpsGuidanceContext.js";
import {
  readMarkdownFiles,
  findImageFiles,
  findCpsAgentFolders,
} from "../services/fileUtils.js";
import { createArchitectureGuided } from "./createArchitecture.js";
import { getExtensionRoot } from "../services/paths.js";
import {
  gatherAgentSnapshot,
  formatAgentSnapshotMarkdown,
} from "../services/solutionReviewer.js";
import {
  requireWorkspaceRoot,
  collectList,
  writePromptAndOpenChat,
} from "../ui/uiUtils.js";

interface SpecDraft {
  agentName: string;
  purpose: string;
  capabilities: string[];
  exclusions: string[];
  successExamples: string[];
  knowledgeSources: string[];
  interactionModel: string | undefined;
}

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

async function readExistingFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

function isStarterSpecTemplate(content: string): boolean {
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

async function collectGuidedSpecDraft(): Promise<SpecDraft | undefined> {
  // Step 1: Agent name
  const agentName = await vscode.window.showInputBox({
    title: "Agent Workbench: Create Specification (1/7)",
    prompt: "What is the agent's name?",
    placeHolder: "e.g. Dataverse Explorer, IT Triage Bot",
    ignoreFocusOut: true,
  });
  if (!agentName) {
    return undefined;
  }

  // Step 2: Purpose
  const purpose = await vscode.window.showInputBox({
    title: "Agent Workbench: Create Specification (2/7)",
    prompt: "Describe the agent's purpose in one or two sentences",
    placeHolder: "e.g. Helps users find and explore Dataverse tables and data",
    ignoreFocusOut: true,
  });
  if (!purpose) {
    return undefined;
  }

  vscode.window.showInformationMessage(
    "Now list what the agent should do. Add items one at a time. Press Escape when done.",
  );
  const capabilities = await collectList(
    "What should the agent do?",
    "e.g. Search Dataverse tables by name or keyword",
  );
  if (capabilities.length === 0) {
    vscode.window.showWarningMessage(
      "Agent Workbench: At least one capability is required.",
    );
    return undefined;
  }

  vscode.window.showInformationMessage(
    "Now list what the agent should NOT do. Press Escape when done.",
  );
  const exclusions = await collectList(
    "What should the agent NOT do?",
    "e.g. Modify or delete data",
  );

  vscode.window.showInformationMessage(
    "Describe what success looks like — concrete examples. Press Escape when done.",
  );
  const successExamples = await collectList(
    "What does success look like?",
    'e.g. User asks about "account" → agent returns matching tables with descriptions',
  );

  vscode.window.showInformationMessage(
    "List the knowledge sources or systems the agent needs. Press Escape when done.",
  );
  const knowledgeSources = await collectList(
    "What knowledge or data sources does the agent need?",
    "e.g. Dataverse table metadata via API",
  );

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
      title: "Agent Workbench: Create Specification (7/7)",
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

  return {
    agentName,
    purpose,
    capabilities,
    exclusions,
    successExamples,
    knowledgeSources,
    interactionModel,
  };
}

/** Unified specification command — creates spec.md and architecture.md */
export async function createSpecCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  const requirementsDir = path.join(root, "Requirements");
  const specPath = path.join(requirementsDir, "spec.md");
  const archPath = path.join(requirementsDir, "architecture.md");
  const existingSpec = await readExistingFile(specPath);
  const existingArchitecture = await readExistingFile(archPath);

  // Detect whether a CPS agent is cloned in the workspace
  const agentFolders = await findCpsAgentFolders(root);

  // Choose creation mode
  const modeOptions: Array<{
    label: string;
    description: string;
    detail: string;
  }> = [
    {
      label: "Guided wizard",
      description:
        "Answer prompts step by step to build spec.md and architecture.md",
      detail: "wizard",
    },
    {
      label: "Generate from requirements docs",
      description:
        "Read documents in Requirements/docs/ and generate spec.md plus architecture.md via Copilot Chat",
      detail: "from-docs",
    },
  ];

  if (agentFolders.length > 0) {
    modeOptions.push({
      label: "Generate from existing agent",
      description:
        "Read cloned CPS agent YAML and reverse-engineer spec.md plus architecture.md via Copilot Chat",
      detail: "from-agent",
    });
  }

  const mode = await vscode.window.showQuickPick(modeOptions, {
    title: "Agent Workbench: Create Specification",
    placeHolder: "How do you want to create the specification?",
    ignoreFocusOut: true,
  });
  if (!mode) {
    return;
  }

  if (mode.detail === "from-docs") {
    await createSpecificationFromDocs(
      root,
      existingSpec && !isStarterSpecTemplate(existingSpec)
        ? existingSpec
        : undefined,
    );
    return;
  }

  if (mode.detail === "from-agent") {
    await createSpecificationFromAgent(root, existingSpec);
    return;
  }

  let createSpec = true;
  if (existingSpec || existingArchitecture) {
    const options: Array<{
      label: string;
      description: string;
      detail: "overwrite-both" | "architecture-only";
    }> = [];

    if (existingSpec && !existingArchitecture) {
      options.push({
        label: "Use existing spec and create architecture",
        description:
          "Keep Requirements/spec.md and create or refresh Requirements/architecture.md",
        detail: "architecture-only",
      });
    }

    options.push({
      label:
        existingSpec || existingArchitecture
          ? "Overwrite specification and architecture"
          : "Create specification and architecture",
      description:
        "Run the full guided flow and rewrite both Requirements/spec.md and Requirements/architecture.md",
      detail: "overwrite-both",
    });

    const existingChoice = await vscode.window.showQuickPick(options, {
      title: "Agent Workbench: Existing files detected",
      placeHolder: "How should Create Specification handle the current files?",
      ignoreFocusOut: true,
    });
    if (!existingChoice) {
      return;
    }
    createSpec = existingChoice.detail === "overwrite-both";
  }

  let draft: SpecDraft | undefined;
  if (createSpec) {
    draft = await collectGuidedSpecDraft();
    if (!draft) {
      return;
    }

    const content = buildSpec(
      draft.agentName,
      draft.purpose,
      draft.capabilities,
      draft.exclusions,
      draft.successExamples,
      draft.knowledgeSources,
      draft.interactionModel,
    );
    await fs.mkdir(requirementsDir, { recursive: true });
    await fs.writeFile(specPath, content, "utf-8");
  }

  await createArchitectureGuided(root, {
    overview: draft?.purpose,
    firstAgent: draft
      ? {
          name: draft.agentName,
          role: draft.purpose,
          knowledge: draft.knowledgeSources,
        }
      : undefined,
  });

  const specDoc = await vscode.workspace.openTextDocument(specPath);
  await vscode.window.showTextDocument(specDoc, { preview: false });

  const architectureDoc = await vscode.workspace.openTextDocument(archPath);
  await vscode.window.showTextDocument(architectureDoc, { preview: false });

  vscode.window.showInformationMessage(
    createSpec
      ? "Agent Workbench: Requirements/spec.md and Requirements/architecture.md created. Review and refine them, then run Build Agent."
      : "Agent Workbench: Requirements/architecture.md created using the existing spec. Review and refine it, then run Build Agent.",
  );
}

/** Pre-Build Agent command — generates reviewable spec.md and architecture.md from requirements docs. */
export async function preBuildAgentCommand(): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  const existingSpec = await readExistingFile(
    path.join(root, "Requirements", "spec.md"),
  );
  await createSpecificationFromDocs(
    root,
    existingSpec && !isStarterSpecTemplate(existingSpec)
      ? existingSpec
      : undefined,
  );
}

/** Generate spec + architecture from requirements docs via Copilot Chat prompt */
export async function createSpecificationFromDocs(
  root: string,
  existingSpec?: string,
): Promise<void> {
  const docsDir = path.join(root, "Requirements", "docs");
  const docs = await readMarkdownFiles(docsDir);

  if (docs.length === 0 && !existingSpec) {
    vscode.window.showWarningMessage(
      "Agent Workbench: No documents found in Requirements/docs/ and no existing spec.md to build from.",
    );
    return;
  }

  // Detect images the user should paste into chat
  const imageFiles = await findImageFiles(docsDir);

  const specTemplatePath = path.join(
    getExtensionRoot(),
    "templates",
    "spec-template.md",
  );
  const architectureTemplatePath = path.join(
    getExtensionRoot(),
    "templates",
    "architecture-template.md",
  );
  let specTemplate = "";
  let architectureTemplate = "";
  try {
    specTemplate = await fs.readFile(specTemplatePath, "utf-8");
  } catch {
    // Template not available — proceed without it
  }
  try {
    architectureTemplate = await fs.readFile(architectureTemplatePath, "utf-8");
  } catch {
    // Template not available — proceed without it
  }

  const cpsGuidancePack = await buildCpsGuidancePack();

  const prompt = [
    "You are running the Agent Workbench Pre-Build Agent step. Read the requirements documents below and generate both a complete spec.md and a complete architecture.md for human review before Build Agent is run.",
    "Use the CPS Guidance Pack below as the authoritative repo standard for platform-safe, best-practice Copilot Studio design.",
    "Do not rely on unstated generic Copilot Studio knowledge when the guidance pack, templates, or requirements documents cover the decision.",
    "",
    existingSpec ? ["## Existing Spec", "", existingSpec].join("\n") : "",
    "",
    docs.length > 0
      ? [
          "## Requirements Documents",
          "",
          ...docs.map(
            (d) =>
              `### ${d.filename.replace(/\.md$/, "").replace(/-/g, " ")}\n\n${d.content}`,
          ),
        ].join("\n")
      : "",
    "",
    specTemplate
      ? [
          "## Spec Template",
          "",
          "Use this structure for Requirements/spec.md:",
          "",
          specTemplate,
        ].join("\n")
      : "",
    "",
    cpsGuidancePack,
    "",
    architectureTemplate
      ? [
          "## Architecture Template",
          "",
          "Use this structure for Requirements/architecture.md:",
          "",
          architectureTemplate,
        ].join("\n")
      : "",
    "",
    "## Instructions",
    "",
    "- Create both Requirements/spec.md and Requirements/architecture.md in one pass",
    "- If spec.md already exists, preserve its intent while improving clarity where the requirements documents justify it",
    "- Normalize the customer requirements into a CPS-compliant solution design that follows the bundled repo guidance, not generic defaults",
    "- Fill in every section of both documents based on what you can infer from the requirements documents",
    "- Keep the spec focused on purpose, scope, boundaries, success criteria, and reference documents",
    "- In the spec, include a 'CPS Constraints & Platform Implications' section that records which platform constraints shape the solution scope and which customer requirements triggered CPS-specific design decisions",
    "- If a customer requirement implies a platform-risky design (e.g. over-tooled agent, child-agent MCP reliance, SharePoint files over 7 MB, unfiltered Dataverse queries), state the constraint in the spec rather than silently carrying it forward",
    "- Exclusions in the spec should include both business exclusions and CPS platform exclusions derived from the guidance pack",
    "- Keep the architecture focused on agent shape, routing, tools, knowledge, manual portal steps, applied CPS constraints, best-practice decisions, known risks, and build state",
    "- Make platform and governance implications explicit: tool strategy, general-knowledge stance, knowledge-source limits, parent/child constraints, and portal-only settings must be called out in the output",
    "- Prefer a shared Dataverse CRUD scaffold (one read, one write, one delete per agent) rather than one connector per business function or table",
    "- If a requirement suggests an anti-pattern or invalid Copilot Studio design, rewrite it into a compliant approach and explain the deviation briefly in the generated document",
    "- If something is not clear from the documents, note it as TBD with a brief explanation of what is missing — do not invent unsupported CPS behavior",
    "- When the repo documentation does not support a design claim, say so explicitly instead of inventing a best practice",
    imageFiles.length > 0
      ? "- Architecture diagrams or design images may be pasted alongside this prompt. If present, use them to inform both documents (network topology, integration points, user flows, routing, authentication, etc.)"
      : "",
    "- Write the spec to Requirements/spec.md",
    "- Write the architecture to Requirements/architecture.md",
    "- Stop after writing those two planning files. Do not create build-checklist.md, CPS YAML, Dataverse schema, actions, topics, knowledge sources, or portal setup instructions in this step.",
    "- End with a short note asking the developer to review and refine Requirements/spec.md and Requirements/architecture.md before running Build Agent.",
  ].join("\n");

  await writePromptAndOpenChat(
    root,
    "specification",
    prompt,
    "Requirements/spec.md and Requirements/architecture.md as separate files",
    "Pre-Build Agent prompt generated from requirements docs.",
    imageFiles,
  );
}

/** Generate spec + architecture by reverse-engineering cloned CPS agent YAML via Copilot Chat */
async function createSpecificationFromAgent(
  root: string,
  existingSpec?: string,
): Promise<void> {
  const agents = await gatherAgentSnapshot(root);

  if (agents.length === 0) {
    vscode.window.showWarningMessage(
      "Agent Workbench: No cloned CPS agent found in the workspace.",
    );
    return;
  }

  // Also read any requirements docs that might exist as supplementary context
  const docsDir = path.join(root, "Requirements", "docs");
  const docs = await readMarkdownFiles(docsDir);
  const imageFiles = await findImageFiles(docsDir);

  const specTemplatePath = path.join(
    getExtensionRoot(),
    "templates",
    "spec-template.md",
  );
  const architectureTemplatePath = path.join(
    getExtensionRoot(),
    "templates",
    "architecture-template.md",
  );
  let specTemplate = "";
  let architectureTemplate = "";
  try {
    specTemplate = await fs.readFile(specTemplatePath, "utf-8");
  } catch {
    // Template not available — proceed without it
  }
  try {
    architectureTemplate = await fs.readFile(architectureTemplatePath, "utf-8");
  } catch {
    // Template not available — proceed without it
  }

  const cpsGuidancePack = await buildCpsGuidancePack();
  const agentYamlMarkdown = formatAgentSnapshotMarkdown(agents);

  const prompt = [
    "You are reverse-engineering an existing Copilot Studio agent. Read the agent YAML configuration below and generate both a complete spec.md and a complete architecture.md that document what this agent currently does.",
    "Use the CPS Guidance Pack below as the authoritative repo standard for platform-safe, best-practice Copilot Studio design.",
    "Do not rely on unstated generic Copilot Studio knowledge when the guidance pack or templates cover the decision.",
    "",
    "## Agent Configuration",
    "",
    agentYamlMarkdown,
    "",
    existingSpec ? ["## Existing Spec", "", existingSpec].join("\n") : "",
    "",
    docs.length > 0
      ? [
          "## Supplementary Requirements Documents",
          "",
          ...docs.map(
            (d) =>
              `### ${d.filename.replace(/\.md$/, "").replace(/-/g, " ")}\n\n${d.content}`,
          ),
        ].join("\n")
      : "",
    "",
    specTemplate
      ? [
          "## Spec Template",
          "",
          "Use this structure for Requirements/spec.md:",
          "",
          specTemplate,
        ].join("\n")
      : "",
    "",
    cpsGuidancePack,
    "",
    architectureTemplate
      ? [
          "## Architecture Template",
          "",
          "Use this structure for Requirements/architecture.md:",
          "",
          architectureTemplate,
        ].join("\n")
      : "",
    "",
    "## Instructions",
    "",
    "- Create both Requirements/spec.md and Requirements/architecture.md in one pass",
    "- Reverse-engineer the agent's purpose, capabilities, boundaries, and success criteria from the YAML configuration — instructions in settings.yaml, topic triggers and descriptions, tool definitions, and knowledge sources",
    "- Infer what the agent should NOT do from explicit exclusions in the instructions or topic boundaries",
    "- Infer success criteria from expected outputs visible in message nodes and tool descriptions",
    "- If supplementary requirements documents exist, incorporate their context but prioritise what the agent YAML actually shows",
    "- If spec.md already exists, preserve its intent while improving clarity where the agent YAML reveals additional detail",
    "- In the architecture, list every agent folder, its role (parent/child/connected), and scope",
    "- List every action YAML with its modelDisplayName, modelDescription, type (connector/flow/MCP), and owning agent",
    "- Infer routing logic from topic trigger descriptions and any parent-child relationships",
    "- List all configured knowledge sources with type and scope",
    "- Flag settings that are portal-only (content moderation, DLP, channel config) as manual portal steps",
    "- Check useModelKnowledge and webBrowsing in settings.yaml and document the general knowledge stance",
    "- Mark all Build State items as complete for components that already exist in the YAML",
    "- Keep the spec focused on purpose, scope, boundaries, success criteria, and reference documents",
    "- Keep the architecture focused on agent shape, routing, tools, knowledge, manual portal steps, applied CPS constraints, best-practice decisions, known risks, and build state",
    "- If the agent configuration reveals anti-patterns or constraint violations against the guidance pack, note them in a 'Known Issues' section in the architecture rather than silently correcting them",
    "- If something cannot be determined from the YAML alone, note it as TBD",
    "- Write the spec to Requirements/spec.md",
    "- Write the architecture to Requirements/architecture.md",
  ].join("\n");

  await writePromptAndOpenChat(
    root,
    "specification",
    prompt,
    "Requirements/spec.md and Requirements/architecture.md as separate files",
    "Specification and architecture reverse-engineered from existing agent YAML.",
    imageFiles,
  );
}
