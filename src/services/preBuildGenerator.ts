import * as fs from "fs/promises";
import * as path from "path";
import {
  readMarkdownFiles,
  fileExists,
  findCpsAgentFolders,
} from "./fileUtils.js";
import { CURRENT_VERSION } from "./config.js";
import { resolveCuratedConnectorRequirement } from "./connectorCatalog.js";

/** Result of checking Dataverse MCP configuration in the workspace */
export interface DataverseMcpStatus {
  configured: boolean;
  serverName?: string;
  url?: string;
  /** Base environment URL extracted from MCP URL (e.g. https://org1234.crm11.dynamics.com) */
  environmentUrl?: string;
}

/**
 * An MCP server entry supplied by the caller (e.g. read from VS Code
 * settings via `vscode.workspace.getConfiguration("mcp")`).
 */
export interface McpServerEntry {
  name: string;
  url?: string;
}

/** Connection details extracted from a cloned CPS agent's .mcs/conn.json */
export interface CpsAgentConnection {
  agentFolder: string;
  dataverseEndpoint: string;
  environmentId: string;
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

/** Parsed topic entry from architecture.md */
interface ArchTopic {
  name: string;
  description: string;
  keyBehaviour: string;
  agentName: string;
}

interface NormalizedConnectorRequirement {
  connectorFamily: string;
  actionName: string;
  ownerAgents: string[];
  sourceTools: ArchTool[];
}

interface NormalizedKnowledgeSourceRequirement {
  source: string;
  type: string;
  description: string;
  agents: string[];
}

interface DetectedKnowledgeSource {
  agentName: string;
  names: string[];
}

/** Generated topic YAML scaffold */
export interface TopicScaffold {
  filename: string;
  content: string;
  topicName: string;
}

// ────────────────────────────────────────────────────────────
//  Pre-Build State Detection
// ────────────────────────────────────────────────────────────

/** A connector action detected from actions/*.mcs.yml */
export interface DetectedAction {
  componentName: string;
  displayName: string;
}

/** Settings coherence flags detected from YAML */
export interface DetectedSettings {
  useModelKnowledge: boolean | null;
  webBrowsing: boolean | null;
  isSemanticSearchEnabled: boolean | null;
  isFileAnalysisEnabled: boolean | null;
  hasKnowledgeSources: boolean;
}

/** State of a cloned CPS agent detected from its YAML files */
export interface DetectedAgentState {
  folderName: string;
  hasInstructions: boolean;
  /** Custom (non-system) topic names found in topics/ */
  customTopics: string[];
  /** Workflow names from workflows subdirectory metadata.yml */
  workflows: string[];
  /** Connector actions from actions directory (.mcs.yml files) */
  actions: DetectedAction[];
  /** Knowledge source names detected from knowledge/ YAML files */
  knowledgeSources: string[];
  /** Child agent componentNames from agents subdirectory */
  childAgents: string[];
  generativeActionsEnabled: boolean;
  /** Settings coherence data */
  settings: DetectedSettings;
}

/** Pre-build state comparing architecture expectations against detected YAML */
export interface PreBuildState {
  /** Architecture agent name → detected state (null = agent folder not found) */
  agents: Map<string, DetectedAgentState | null>;
  /** All cloned agent folder names found in workspace */
  detectedFolders: string[];
}

/** Parse ## Agents section from architecture.md */
function parseAgents(content: string): ArchAgent[] {
  const agents: ArchAgent[] = [];
  const agentSection = extractSection(content, "Agents");
  if (!agentSection) {
    return agents;
  }

  // Known non-agent sub-headings that may appear under ## Agents
  const NON_AGENT_HEADINGS = new Set(["topics", "routing", "routing logic"]);

  // Split by ### headings
  const agentBlocks = agentSection.split(/^### /m).filter((b) => b.trim());
  for (const block of agentBlocks) {
    const lines = block.split("\n");
    const name = lines[0].trim();
    if (!name || NON_AGENT_HEADINGS.has(name.toLowerCase())) {
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
    // Parse table rows generically — handle 4+ column tables.
    // Columns: split on | and trim.
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 4) {
      continue;
    }
    const name = cells[0];
    const owner = cells[1];
    // Purpose is second-to-last; manual flag is last
    const purpose = cells[cells.length - 2];
    const manual = cells[cells.length - 1];
    // Skip header rows, separator rows, and sub-table headers
    if (name.startsWith("-") || owner.startsWith("-")) {
      continue;
    }
    const nameLower = name.toLowerCase();
    if (
      nameLower.includes("tool") ||
      nameLower.includes("flow") ||
      nameLower.includes("none defined")
    ) {
      continue;
    }
    tools.push({
      name: name.trim(),
      ownerAgent: owner.trim(),
      purpose: purpose.trim(),
      manualStep: manual.trim().toLowerCase().startsWith("yes"),
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

/** System topics already present in cloned agents — do not scaffold */
const SYSTEM_TOPICS = new Set([
  "conversation start",
  "conversationstart",
  "greeting",
  "goodbye",
  "escalate",
  "escalation",
  "fallback",
  "end of conversation",
  "endofconversation",
  "start over",
  "startover",
  "reset conversation",
  "resetconversation",
  "thank you",
  "thankyou",
  "multiple topics matched",
  "multipletopicsmatched",
  "on error",
  "onerror",
  "sign in",
  "signin",
  "search",
  "conversational boosting",
  "conversationalboosting",
]);

/** Parse Topics table from within ## Agents section */
function parseTopics(content: string): ArchTopic[] {
  const topics: ArchTopic[] = [];
  const agentSection = extractSection(content, "Agents");
  if (!agentSection) {
    return topics;
  }

  // Find ### Topics subsection
  const topicsMatch = agentSection.match(
    /### Topics\s*\n([\s\S]*?)(?=\n### |\n## |$(?![\s\S]))/,
  );
  if (!topicsMatch) {
    return topics;
  }

  const topicsContent = topicsMatch[1];

  // Determine which agent this subsection belongs to.
  // Check the content for explicit "parent agent" / "child agent" keywords,
  // then fall back to the heading immediately before ### Topics.
  const blocks = agentSection.split(/^### /m).filter((b) => b.trim());
  let agentName = "";
  const parentHint = /\bparent\s+agent\b/i.test(topicsContent);
  if (parentHint) {
    // Find the agent whose heading contains "(Parent)" or is first
    for (const block of blocks) {
      const firstLine = block.split("\n")[0].trim();
      if (/\(parent\)/i.test(firstLine)) {
        agentName = firstLine;
        break;
      }
    }
  }
  if (!agentName) {
    for (const block of blocks) {
      const firstLine = block.split("\n")[0].trim();
      if (firstLine.toLowerCase() === "topics") {
        break;
      }
      agentName = firstLine;
    }
  }

  for (const line of topicsContent.split("\n")) {
    const match = line.match(
      /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/,
    );
    if (!match) {
      continue;
    }
    const [, name, description, keyBehaviour] = match;
    if (name.startsWith("-") || name.toLowerCase().includes("topic")) {
      continue;
    }
    if (!name.trim()) {
      continue;
    }
    topics.push({
      name: name.trim(),
      description: description.trim(),
      keyBehaviour: keyBehaviour.trim(),
      agentName,
    });
  }

  return topics;
}

/** Parse Routing Logic section to extract trigger phrases per topic */
function parseRoutingTriggers(content: string): Map<string, string[]> {
  const triggers = new Map<string, string[]>();
  const section = extractSection(content, "Routing Logic");
  if (!section) {
    return triggers;
  }

  for (const line of section.split("\n")) {
    // Match: - "phrase1" or/| "phrase2" → **TopicName**
    const topicMatch = line.match(/→\s*\*\*([^*]+)\*\*/);
    if (!topicMatch) {
      continue;
    }
    const topicName = topicMatch[1].trim();
    const phrases: string[] = [];
    const beforeArrow = line.split("→")[0];
    // Match both regular quotes "..." and Unicode smart quotes \u201c...\u201d
    const quoteMatches = beforeArrow.matchAll(
      /\u201c([^\u201d]+)\u201d|"([^"]+)"/g,
    );
    for (const m of quoteMatches) {
      // Remove [placeholder] tokens like [name]
      const phrase = (m[1] ?? m[2]).replace(/\[.*?\]/g, "").trim();
      if (phrase) {
        phrases.push(phrase);
      }
    }
    if (phrases.length > 0) {
      triggers.set(topicName, phrases);
    }
  }

  return triggers;
}

/** Convert a topic name to a PascalCase .mcs.yml filename */
function toTopicFilename(name: string): string {
  return name.replace(/\s+/g, "") + ".mcs.yml";
}

/** Generate a deterministic short ID from a string */
function shortId(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 6);
}

/** Escape a string for YAML double-quoted scalar */
function escapeYamlStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Wrap a YAML value in quotes if it contains special characters */
function yamlValue(s: string): string {
  if (
    /[:"'{}\[\]|>&*!%@`#,]/.test(s) ||
    s.startsWith("-") ||
    s.startsWith("?")
  ) {
    return `"${escapeYamlStr(s)}"`;
  }
  return s;
}

/** Generate topic YAML scaffold files from architecture content */
export function generateTopicScaffolds(architecture: string): TopicScaffold[] {
  const topics = parseTopics(architecture);
  const triggers = parseRoutingTriggers(architecture);
  const scaffolds: TopicScaffold[] = [];

  for (const topic of topics) {
    if (SYSTEM_TOPICS.has(topic.name.toLowerCase())) {
      continue;
    }

    const filename = toTopicFilename(topic.name);
    const topicTriggers = triggers.get(topic.name) || [
      topic.name.toLowerCase(),
    ];

    const id = shortId(topic.name);
    const desc = topic.description;

    const lines: string[] = [
      "mcs.metadata:",
      `  componentName: ${topic.name}`,
      `  description: ${yamlValue(desc)}`,
      "kind: AdaptiveDialog",
      `modelDescription: ${yamlValue(desc)}`,
      "beginDialog:",
      "  kind: OnRecognizedIntent",
      "  id: main",
      "  intent:",
      `    displayName: ${topic.name}`,
      "    includeInOnSelectIntent: false",
      "    triggerQueries:",
    ];

    for (const trigger of topicTriggers) {
      lines.push(`      - ${trigger}`);
    }

    lines.push(
      "",
      "  actions:",
      "    - kind: SendActivity",
      `      id: sendMessage_${id}`,
      "      activity:",
      "        text:",
      `          - "[Pre-Build Scaffold] This topic handles: ${topic.name}. Topic actions will be configured in the Build phase."`,
    );

    scaffolds.push({
      filename,
      content: lines.join("\n") + "\n",
      topicName: topic.name,
    });
  }

  return scaffolds;
}

/** Extract a ## section from markdown (up to next ## or end) */
function extractSection(content: string, heading: string): string | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use [^\n]*\n to consume the heading line (including newline).
  // End lookahead uses $(?![\s\S]) for true end-of-string in multiline mode,
  // because bare $ would match any line-end and the lazy quantifier would stop too early.
  const regex = new RegExp(
    `^## ${escapedHeading}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$(?![\\s\\S]))`,
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

/** Infer the likely implementation surface for a tool from its purpose text */
function inferToolImplementation(tool: ArchTool): string {
  const curatedConnector = resolveCuratedConnectorRequirement(
    tool.name,
    tool.purpose,
  );
  if (curatedConnector) {
    return `${curatedConnector.connectorName} action`;
  }

  const lower = `${tool.name} ${tool.purpose}`.toLowerCase();

  if (isMcpTool(tool)) {
    return "MCP tool";
  }

  if (isFlowTool(tool)) {
    return "Power Automate flow";
  }

  if (
    lower.includes("dataverse") ||
    lower.includes("table") ||
    lower.includes("row ") ||
    lower.includes(" row") ||
    lower.includes("incident row")
  ) {
    return "Dataverse connector action";
  }

  if (
    lower.includes("adaptive card") ||
    lower.includes("teams support channel") ||
    lower.includes("channel id") ||
    lower.includes("teams message") ||
    lower.includes("post the triage summary")
  ) {
    return "Teams connector action";
  }

  if (
    lower.includes("email") ||
    lower.includes("mailbox") ||
    lower.includes("recipient address") ||
    lower.includes("on-call")
  ) {
    return "Outlook connector action";
  }

  if (
    lower.includes("profile") ||
    lower.includes("department") ||
    lower.includes("manager") ||
    lower.includes("upn") ||
    lower.includes("organisational context")
  ) {
    return "user profile connector action";
  }

  if (lower.includes("child-agent") || lower.includes("child agent")) {
    return "child agent tool";
  }

  return "connector action";
}

function formatToolChecklistItem(
  tool: ArchTool,
  label: string = "tool",
): string {
  const implementation = inferToolImplementation(tool);
  return `- [ ] Add ${label}: **${tool.name}** (${implementation}) → ${tool.ownerAgent}  
  Purpose: ${tool.purpose}`;
}

function inferStandardConnectorRequirement(
  tool: ArchTool,
): Omit<NormalizedConnectorRequirement, "sourceTools" | "ownerAgents"> {
  const curatedConnector = resolveCuratedConnectorRequirement(
    tool.name,
    tool.purpose,
  );
  if (curatedConnector) {
    return {
      connectorFamily: curatedConnector.connectorName,
      actionName: curatedConnector.actionName,
    };
  }

  const lower = `${tool.name} ${tool.purpose}`.toLowerCase();

  if (isDataverseTool(tool)) {
    if (/(create|creates|add a new row|create incident record)/i.test(lower)) {
      return {
        connectorFamily: "Microsoft Dataverse",
        actionName: "Add a new row to selected environment",
      };
    }

    if (/(update|updates)/i.test(lower)) {
      return {
        connectorFamily: "Microsoft Dataverse",
        actionName: "Update a row",
      };
    }

    if (/(delete|removes)/i.test(lower)) {
      return {
        connectorFamily: "Microsoft Dataverse",
        actionName: "Delete a row",
      };
    }

    return {
      connectorFamily: "Microsoft Dataverse",
      actionName: "List rows from selected environment",
    };
  }

  if (
    lower.includes("profile") ||
    lower.includes("department") ||
    lower.includes("manager") ||
    lower.includes("upn") ||
    lower.includes("organisational context")
  ) {
    return {
      connectorFamily: "Office 365 Users",
      actionName: "Get user profile (V2)",
    };
  }

  if (
    lower.includes("adaptive card") ||
    lower.includes("teams support channel") ||
    lower.includes("channel id") ||
    lower.includes("post the triage summary")
  ) {
    return {
      connectorFamily: "Microsoft Teams",
      actionName: "Post card in a chat or channel",
    };
  }

  if (
    lower.includes("teams message") ||
    lower.includes("chat or channel") ||
    lower.includes("post message")
  ) {
    return {
      connectorFamily: "Microsoft Teams",
      actionName: "Post message in a chat or channel",
    };
  }

  if (
    lower.includes("email") ||
    lower.includes("mailbox") ||
    lower.includes("recipient address") ||
    lower.includes("on-call")
  ) {
    return {
      connectorFamily: "Office 365 Outlook",
      actionName: "Send an email (V2)",
    };
  }

  return {
    connectorFamily: "Connector action",
    actionName: tool.name,
  };
}

function buildNormalizedConnectorRequirements(
  tools: ArchTool[],
): NormalizedConnectorRequirement[] {
  const grouped = new Map<string, NormalizedConnectorRequirement>();

  for (const tool of tools) {
    if (isMcpTool(tool) || isFlowTool(tool)) {
      continue;
    }

    const inferred = inferStandardConnectorRequirement(tool);
    const key = [
      normalizeForMatch(inferred.connectorFamily),
      normalizeForMatch(inferred.actionName),
    ].join("::");

    const existing = grouped.get(key);
    if (existing) {
      if (!existing.ownerAgents.includes(tool.ownerAgent)) {
        existing.ownerAgents.push(tool.ownerAgent);
      }
      existing.sourceTools.push(tool);
      continue;
    }

    grouped.set(key, {
      ...inferred,
      ownerAgents: [tool.ownerAgent],
      sourceTools: [tool],
    });
  }

  return [...grouped.values()];
}

function formatNormalizedConnectorRequirement(
  req: NormalizedConnectorRequirement,
): string[] {
  return [`- [ ] Add action: **${req.connectorFamily} - ${req.actionName}**`];
}

function buildNormalizedKnowledgeSourceRequirements(
  knowledgeSources: ArchKnowledge[],
  agentKnowledgeSources: Array<{ source: string; agent: string }>,
): NormalizedKnowledgeSourceRequirement[] {
  const grouped = new Map<string, NormalizedKnowledgeSourceRequirement>();

  for (const ks of knowledgeSources) {
    const key = normalizeForMatch(ks.source);
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.agents.includes(ks.agent)) {
        existing.agents.push(ks.agent);
      }
      if (!existing.type && ks.type) {
        existing.type = ks.type;
      }
      if (!existing.description && ks.description) {
        existing.description = ks.description;
      }
      continue;
    }

    grouped.set(key, {
      source: ks.source,
      type: ks.type,
      description: ks.description,
      agents: [ks.agent],
    });
  }

  for (const ks of agentKnowledgeSources) {
    const key = normalizeForMatch(ks.source);
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.agents.includes(ks.agent)) {
        existing.agents.push(ks.agent);
      }
      continue;
    }

    grouped.set(key, {
      source: ks.source,
      type: "",
      description: "",
      agents: [ks.agent],
    });
  }

  return [...grouped.values()].sort((a, b) => a.source.localeCompare(b.source));
}

function formatKnowledgeSourceChecklistItem(
  req: NormalizedKnowledgeSourceRequirement,
): string {
  if (req.agents.length > 1) {
    return `- [ ] Add shared knowledge source: **${req.source}**`;
  }
  return `- [ ] Add knowledge source: **${req.source}** → ${req.agents[0]}`;
}

function normalizeManualPortalStep(step: string): string {
  const normalized = step.trim();
  const lower = normalized.toLowerCase();

  if (
    lower.includes("modeldescription") &&
    lower.includes("tool descriptions")
  ) {
    return "In Copilot Studio, open each tool/action and replace the default description text with the final Tool Descriptions from architecture.md. For Dataverse actions, include the real table names, filterable schema fields, and one valid OData filter example.";
  }

  return normalized;
}

function normalizeKnowledgeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.md$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function knowledgeTokens(value: string): string[] {
  return normalizeKnowledgeToken(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function knowledgeSourceMatches(
  expected: string,
  detectedNames: string[],
): boolean {
  const expectedNorm = normalizeKnowledgeToken(expected);
  const expectedWords = knowledgeTokens(expected);

  return detectedNames.some((candidate) => {
    const candidateNorm = normalizeKnowledgeToken(candidate);
    if (!candidateNorm) {
      return false;
    }

    if (
      candidateNorm === expectedNorm ||
      candidateNorm.includes(expectedNorm) ||
      expectedNorm.includes(candidateNorm)
    ) {
      return true;
    }

    const candidateWords = knowledgeTokens(candidate);
    if (expectedWords.length === 0 || candidateWords.length === 0) {
      return false;
    }

    const overlap = expectedWords.filter((word) =>
      candidateWords.includes(word),
    ).length;

    return overlap >= Math.min(2, expectedWords.length);
  });
}

function collectAllKnowledgeSources(
  state: PreBuildState,
): DetectedKnowledgeSource[] {
  const all: DetectedKnowledgeSource[] = [];
  for (const [agentName, agentState] of state.agents.entries()) {
    if (agentState && agentState.knowledgeSources.length > 0) {
      all.push({
        agentName,
        names: agentState.knowledgeSources,
      });
    }
  }
  return all;
}

async function collectKnowledgeSourceFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectKnowledgeSourceFiles(fullPath)));
        continue;
      }

      if (
        entry.isFile() &&
        (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))
      ) {
        files.push(fullPath);
      }
    }
  } catch {
    return [];
  }

  return files;
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
    "Create the core tables, relationships, and columns needed to support the agent's domain.",
    "Assume the Copilot Studio implementation will use a small shared Dataverse connector set: one generic read tool, one generic write tool, and one generic delete tool.",
    "Do not create separate CRUD tools, tables, or schema fragments for each function or each table unless the domain genuinely requires a distinct data model.",
    "Use appropriate column types (Choice for enums, Lookup for relationships, Currency for money, etc.).",
    "Add a Status column with sensible choices where applicable.",
    'Use singular table names (e.g. "Case" not "Cases").',
    "After creating each table, inspect the created table schema through the Dataverse MCP server to confirm the table, columns, and relationships are correct.",
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
 *
 * @param environmentUrl  Base Dataverse environment URL (e.g. https://org1234.crm11.dynamics.com).
 *                        When provided, the prompt tells Copilot to target that specific environment.
 */
export function composeDataverseChatPrompt(
  spec: string,
  architecture: string,
  environmentUrl?: string,
): string {
  const tools = parseTools(architecture);
  const dvTools = tools.filter(isDataverseTool);
  if (dvTools.length === 0) {
    return "";
  }

  const toolList = dvTools
    .map((t) => `- ${t.name} (${t.ownerAgent}): ${t.purpose}`)
    .join("\n");

  const lines: string[] = [
    "I need you to create Dataverse tables for a Copilot Studio agent using the Dataverse MCP tools.",
    "",
  ];

  if (environmentUrl) {
    lines.push(
      `Target environment: ${environmentUrl}`,
      "Use the Dataverse MCP server connected to this environment.",
      "",
    );
  }

  lines.push(
    "Agent purpose:",
    extractPurpose(spec),
    "",
    "The following tools/connectors will interact with Dataverse:",
    toolList,
    "",
    "Create the core tables, relationships, and columns needed to support the agent's domain.",
    "Assume the Copilot Studio implementation will use a small shared Dataverse connector set: one generic read tool, one generic write tool, and one generic delete tool.",
    "Do not create separate CRUD tools, tables, or schema fragments for each function or each table unless the domain genuinely requires a distinct data model.",
    "Use appropriate column types (Choice for enums, Lookup for relationships, Currency for money, etc.).",
    "Add a Status column with sensible choices where applicable.",
    'Use singular table names (e.g. "Case" not "Cases").',
    "After creating each table, inspect the created table schema through the Dataverse MCP server to confirm the table, columns, and relationships are correct.",
    "After creating the tables, run a Dataverse sample-data stage and insert the required startup records that let the agent work immediately, such as SLA policies, routing rules, lookup values, or known issues if the spec or architecture implies them.",
    "Do not leave required sample data as a suggested next step. Load it now when it is needed for the solution to work immediately.",
    "After the Dataverse MCP server confirms the live schema, capture the real logical table names and column names and use those exact names in the rest of the build.",
    "Do not leave field-name alignment as a suggested next step. Align Dataverse action descriptions, OData examples, and topic logic to the live field names now.",
    "Return a summary of the tables created, the sample data inserted, and the live logical names that downstream build steps must use.",
  );

  return lines.join("\n");
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
      "Your architecture includes Dataverse tools. If Build will create tables through GitHub Copilot Agent mode, make sure Dataverse MCP is available before the Build phase.",
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
      sections.push(
        "Use a minimal shared Dataverse CRUD scaffold instead of one connector per table or function:",
      );
      sections.push(
        "- [ ] Add one generic **Read/List rows** action per agent that needs Dataverse",
      );
      sections.push(
        "- [ ] Add one generic **Write** action per agent that needs Dataverse (create/update as appropriate)",
      );
      sections.push(
        "- [ ] Add one generic **Delete** action only if the architecture genuinely needs destructive operations",
      );
      sections.push(
        "- [ ] Reuse these shared actions across tables; do not create separate CRUD connectors for every table during pre-build",
      );
      sections.push(
        "",
        "Dataverse-backed capabilities called out in the architecture:",
      );
      for (const tool of dvTools) {
        sections.push(`- ${tool.name} → ${tool.ownerAgent}: ${tool.purpose}`);
      }
      sections.push("");
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

  // 5a. GHCP prompts for things Copilot can help with
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
    "## Dataverse Tables",
    "",
    "Pre-Build defines the Dataverse schema only.",
    "Build creates the actual tables via GitHub Copilot Agent mode or another approved Dataverse workflow.",
    "Keep the design aligned to a minimal shared connector set: one generic read tool, one generic write tool, and one generic delete tool only where needed.",
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

/** Check whether a URL looks like a Dataverse MCP endpoint */
function isDataverseMcpUrl(url: string): boolean {
  return (
    url.includes("dynamics.com/api/mcp") ||
    (url.includes("crm") && url.includes("/api/mcp"))
  );
}

/** Extract the base environment URL from a Dataverse MCP URL */
function extractEnvironmentUrl(mcpUrl: string): string {
  // https://org1234.crm11.dynamics.com/api/mcp  →  https://org1234.crm11.dynamics.com
  try {
    const u = new URL(mcpUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return mcpUrl.replace(/\/api\/mcp.*$/i, "");
  }
}

/** Build a DataverseMcpStatus from a matched server name + url */
function buildMcpStatus(name: string, url: string): DataverseMcpStatus {
  return {
    configured: true,
    serverName: name,
    url,
    environmentUrl: extractEnvironmentUrl(url),
  };
}

/**
 * Detect whether a Dataverse MCP server is configured in the workspace.
 *
 * Checks, in order:
 * 1. `.vscode/mcp.json` — workspace-level MCP config file
 * 2. `extraServers` — entries from VS Code settings (`mcp.servers` in user
 *    or workspace `settings.json`), passed in by the command layer which
 *    has access to the `vscode` API.
 */
export async function detectDataverseMcp(
  workspaceRoot: string,
  extraServers?: McpServerEntry[],
): Promise<DataverseMcpStatus> {
  // --- 1. Check .vscode/mcp.json ---
  const mcpJsonPath = path.join(workspaceRoot, ".vscode", "mcp.json");
  try {
    const raw = await fs.readFile(mcpJsonPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      const obj = parsed as Record<string, unknown>;
      const servers = obj.servers;
      if (
        typeof servers === "object" &&
        servers !== null &&
        !Array.isArray(servers)
      ) {
        const serversObj = servers as Record<string, unknown>;
        for (const [name, config] of Object.entries(serversObj)) {
          if (typeof config !== "object" || config === null) {
            continue;
          }
          const serverConfig = config as Record<string, unknown>;
          const url = String(serverConfig.url ?? "");
          if (isDataverseMcpUrl(url)) {
            return buildMcpStatus(name, url);
          }
        }
      }
    }
  } catch {
    // File doesn't exist or is invalid — continue to next source
  }

  // --- 2. Check entries from VS Code settings ---
  if (extraServers) {
    for (const server of extraServers) {
      if (server.url && isDataverseMcpUrl(server.url)) {
        return buildMcpStatus(server.name, server.url);
      }
    }
  }

  return { configured: false };
}

/**
 * Read connection details from a cloned CPS agent's `.mcs/conn.json`.
 * Scans all detected agent folders and returns the first one that has
 * a Dataverse endpoint.
 */
export async function readAgentConnection(
  workspaceRoot: string,
): Promise<CpsAgentConnection | null> {
  const agentFolders = await findCpsAgentFolders(workspaceRoot);
  for (const folder of agentFolders) {
    const connPath = path.join(workspaceRoot, folder, ".mcs", "conn.json");
    try {
      const raw = await fs.readFile(connPath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        const obj = parsed as Record<string, unknown>;
        const endpoint =
          typeof obj.DataverseEndpoint === "string"
            ? obj.DataverseEndpoint
            : "";
        const envId =
          typeof obj.EnvironmentId === "string" ? obj.EnvironmentId : "";
        if (endpoint) {
          return {
            agentFolder: folder,
            dataverseEndpoint: endpoint.replace(/\/+$/, ""),
            environmentId: envId,
          };
        }
      }
    } catch {
      // No conn.json or invalid — try next agent
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────
//  Pre-Build State Detection — Scan / Match / Report
// ────────────────────────────────────────────────────────────

/** Normalize a name for fuzzy matching (lowercase, strip spaces/punctuation) */
function normalizeForMatch(name: string): string {
  return name.toLowerCase().replace(/[\s_\-()]+/g, "");
}

/** Read mcs.metadata.componentName from a CPS YAML file */
function parseComponentName(yamlContent: string): string {
  const match = yamlContent.match(/^\s*componentName:\s*(.+)$/m);
  if (!match) {
    return "";
  }
  // Strip surrounding YAML quotes and trim whitespace
  return match[1]
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

/** Return true if agent.mcs.yml contains non-empty instructions */
function agentHasInstructions(agentYaml: string): boolean {
  const lines = agentYaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^instructions:/.test(lines[i])) {
      continue;
    }
    const inline = lines[i].replace(/^instructions:\s*/, "").trim();
    if (inline && inline !== "|" && inline !== ">") {
      return true;
    }
    // Multi-line block scalar
    if (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
      return true;
    }
    return false;
  }
  return false;
}

/** Read modelDisplayName from a CPS action YAML file */
function parseDisplayName(yamlContent: string): string {
  const match = yamlContent.match(/^modelDisplayName:\s*(.+)$/m);
  return match ? match[1].trim() : "";
}

/** Scan a cloned CPS agent folder and return its current state */
async function scanAgentFolder(
  folderPath: string,
): Promise<DetectedAgentState> {
  const folderName = path.basename(folderPath);

  // Instructions
  let hasInstr = false;
  try {
    const yaml = await fs.readFile(
      path.join(folderPath, "agent.mcs.yml"),
      "utf-8",
    );
    hasInstr = agentHasInstructions(yaml);
  } catch {
    /* no agent.mcs.yml */
  }

  // Custom topics (non-system)
  const customTopics: string[] = [];
  try {
    const files = await fs.readdir(path.join(folderPath, "topics"));
    for (const file of files) {
      if (!file.endsWith(".mcs.yml")) {
        continue;
      }
      try {
        const content = await fs.readFile(
          path.join(folderPath, "topics", file),
          "utf-8",
        );
        const name = (
          parseComponentName(content) || file.replace(".mcs.yml", "")
        ).trim();
        if (!SYSTEM_TOPICS.has(name.toLowerCase())) {
          customTopics.push(name);
        }
      } catch {
        /* unreadable topic */
      }
    }
  } catch {
    /* no topics folder */
  }

  // Workflows — each is a subdirectory with metadata.yml
  const workflows: string[] = [];
  try {
    const entries = await fs.readdir(path.join(folderPath, "workflows"), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      try {
        const meta = await fs.readFile(
          path.join(folderPath, "workflows", entry.name, "metadata.yml"),
          "utf-8",
        );
        const nameMatch = meta.match(/^name:\s*(.+)$/m);
        workflows.push(nameMatch ? nameMatch[1].trim() : entry.name);
      } catch {
        /* no metadata.yml — use folder name */
        workflows.push(entry.name);
      }
    }
  } catch {
    /* no workflows folder */
  }

  // Connector actions from actions/*.mcs.yml
  const actions: DetectedAction[] = [];
  try {
    const files = await fs.readdir(path.join(folderPath, "actions"));
    for (const file of files) {
      if (!file.endsWith(".mcs.yml")) {
        continue;
      }
      try {
        const content = await fs.readFile(
          path.join(folderPath, "actions", file),
          "utf-8",
        );
        actions.push({
          componentName:
            parseComponentName(content) || file.replace(".mcs.yml", ""),
          displayName: parseDisplayName(content) || "",
        });
      } catch {
        /* unreadable action */
      }
    }
  } catch {
    /* no actions folder */
  }

  // Knowledge sources from knowledge/*.yml
  const knowledgeSources = new Set<string>();
  const knowledgeFiles = await collectKnowledgeSourceFiles(
    path.join(folderPath, "knowledge"),
  );
  for (const filePath of knowledgeFiles) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const componentName = parseComponentName(content);
      if (componentName) {
        knowledgeSources.add(componentName);
      }
      const file = path.basename(filePath);
      knowledgeSources.add(file.replace(/\.(knowledge\.)?mcs\.ya?ml$/i, ""));
      knowledgeSources.add(file.replace(/\.ya?ml$/i, ""));
    } catch {
      /* unreadable knowledge source */
    }
  }

  // Child agents from agents/*/agent.mcs.yml
  const childAgents: string[] = [];
  try {
    const entries = await fs.readdir(path.join(folderPath, "agents"), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      try {
        const agentYaml = await fs.readFile(
          path.join(folderPath, "agents", entry.name, "agent.mcs.yml"),
          "utf-8",
        );
        childAgents.push(parseComponentName(agentYaml) || entry.name);
      } catch {
        /* no agent.mcs.yml in child folder */
      }
    }
  } catch {
    /* no agents folder */
  }

  // Settings & capabilities
  let genActions = false;
  const detectedSettings: DetectedSettings = {
    useModelKnowledge: null,
    webBrowsing: null,
    isSemanticSearchEnabled: null,
    isFileAnalysisEnabled: null,
    hasKnowledgeSources: false,
  };

  try {
    const settings = await fs.readFile(
      path.join(folderPath, "settings.mcs.yml"),
      "utf-8",
    );
    genActions = /GenerativeActionsEnabled:\s*true/i.test(settings);

    // Parse settings flags
    const mkMatch = settings.match(/useModelKnowledge:\s*(true|false)/i);
    if (mkMatch) {
      detectedSettings.useModelKnowledge = mkMatch[1].toLowerCase() === "true";
    }
    const ssMatch = settings.match(/isSemanticSearchEnabled:\s*(true|false)/i);
    if (ssMatch) {
      detectedSettings.isSemanticSearchEnabled =
        ssMatch[1].toLowerCase() === "true";
    }
    const faMatch = settings.match(/isFileAnalysisEnabled:\s*(true|false)/i);
    if (faMatch) {
      detectedSettings.isFileAnalysisEnabled =
        faMatch[1].toLowerCase() === "true";
    }
  } catch {
    /* no settings */
  }

  // Check agent.mcs.yml for webBrowsing
  try {
    const agentConfig = await fs.readFile(
      path.join(folderPath, "agent.mcs.yml"),
      "utf-8",
    );
    const wbMatch = agentConfig.match(/webBrowsing:\s*(true|false)/i);
    if (wbMatch) {
      detectedSettings.webBrowsing = wbMatch[1].toLowerCase() === "true";
    }
  } catch {
    /* already read above */
  }

  // Check for knowledge sources (knowledge/ directory)
  try {
    const knowledgeEntries = await fs.readdir(
      path.join(folderPath, "knowledge"),
    );
    detectedSettings.hasKnowledgeSources = knowledgeEntries.length > 0;
  } catch {
    /* no knowledge dir */
  }

  return {
    folderName,
    hasInstructions: hasInstr,
    customTopics,
    workflows,
    actions,
    knowledgeSources: [...knowledgeSources],
    childAgents,
    generativeActionsEnabled: genActions,
    settings: detectedSettings,
  };
}

/**
 * Scan a child agent inside a parent's agents/ subdirectory.
 * CPS child agents have their own agent.mcs.yml and actions/ but no
 * topics or workflows (those belong to the parent).
 */
async function scanChildAgent(
  parentFolderPath: string,
  childComponentName: string,
): Promise<DetectedAgentState | null> {
  try {
    const agentsDir = path.join(parentFolderPath, "agents");
    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const childPath = path.join(agentsDir, entry.name);
      try {
        const yaml = await fs.readFile(
          path.join(childPath, "agent.mcs.yml"),
          "utf-8",
        );
        const name = parseComponentName(yaml) || entry.name;
        if (normalizeForMatch(name) === normalizeForMatch(childComponentName)) {
          // Found the right child folder — scan it
          const state = await scanAgentFolder(childPath);
          return { ...state, folderName: name };
        }
      } catch {
        /* no agent.mcs.yml */
      }
    }
  } catch {
    /* no agents dir */
  }
  return null;
}

/**
 * Detect pre-build state by scanning cloned agent folders and comparing
 * against architecture expectations.
 */
export async function detectPreBuildState(
  workspaceRoot: string,
  architecture: string,
): Promise<PreBuildState> {
  const expectedAgents = parseAgents(architecture);
  const agentFolders = await findCpsAgentFolders(workspaceRoot);

  // Scan every detected folder
  const scannedMap = new Map<string, DetectedAgentState>();
  for (const folder of agentFolders) {
    const state = await scanAgentFolder(path.join(workspaceRoot, folder));
    scannedMap.set(folder, state);
  }

  // Match architecture agents → scanned folders.
  // Strategy: exact normalized match → substring containment
  //         → significant word overlap → positional fallback.
  const agents = new Map<string, DetectedAgentState | null>();
  const matched = new Set<string>();

  // Pass 1: exact normalized match
  for (const expected of expectedAgents) {
    const norm = normalizeForMatch(expected.name);
    for (const [folder, state] of scannedMap) {
      if (matched.has(folder)) {
        continue;
      }
      if (normalizeForMatch(folder) === norm) {
        agents.set(expected.name, state);
        matched.add(folder);
        break;
      }
    }
  }

  // Pass 2: substring containment
  for (const expected of expectedAgents) {
    if (agents.has(expected.name)) {
      continue;
    }
    const norm = normalizeForMatch(expected.name);
    for (const [folder, state] of scannedMap) {
      if (matched.has(folder)) {
        continue;
      }
      const folderNorm = normalizeForMatch(folder);
      if (norm.includes(folderNorm) || folderNorm.includes(norm)) {
        agents.set(expected.name, state);
        matched.add(folder);
        break;
      }
    }
  }

  // Pass 3: significant word overlap. Architecture name “Employee Onboarding
  // Orchestrator” and folder “HROnboarding” share the word “onboarding”.
  // Consider a match if ≥50% of significant words (length≥3) overlap.
  for (const expected of expectedAgents) {
    if (agents.has(expected.name)) {
      continue;
    }
    const archWords = expected.name
      .toLowerCase()
      .split(/[\s_\-()]+/)
      .filter((w) => w.length >= 3);
    if (archWords.length === 0) {
      continue;
    }
    for (const [folder, state] of scannedMap) {
      if (matched.has(folder)) {
        continue;
      }
      const folderLower = folder.toLowerCase();
      const hits = archWords.filter((w) => folderLower.includes(w)).length;
      if (hits / archWords.length >= 0.5) {
        agents.set(expected.name, state);
        matched.add(folder);
        break;
      }
    }
  }

  // Pass 4: if exactly one unmatched architecture agent remains and
  // exactly one unmatched folder remains, pair them.
  const unmatchedExpected = expectedAgents.filter((a) => !agents.has(a.name));
  const unmatchedFolders = agentFolders.filter((f) => !matched.has(f));
  if (unmatchedExpected.length === 1 && unmatchedFolders.length === 1) {
    agents.set(unmatchedExpected[0].name, scannedMap.get(unmatchedFolders[0])!);
    matched.add(unmatchedFolders[0]);
  }

  // Pass 5: match child agents. CPS child agents live inside a parent's
  // agents/ subdirectory, not as top-level folders. Check unmatched arch
  // agents against childAgents detected in already-matched parents.
  for (const expected of expectedAgents) {
    if (agents.has(expected.name)) {
      continue;
    }
    const norm = normalizeForMatch(expected.name);
    for (const [, parentState] of agents) {
      if (!parentState) {
        continue;
      }
      for (const childName of parentState.childAgents) {
        const childNorm = normalizeForMatch(childName);
        if (
          norm === childNorm ||
          norm.includes(childNorm) ||
          childNorm.includes(norm)
        ) {
          // Scan child agent folder for its own state (actions, etc.)
          const parentFolder = agentFolders.find(
            (f) => scannedMap.get(f) === parentState,
          );
          if (parentFolder) {
            const childState = await scanChildAgent(
              path.join(workspaceRoot, parentFolder),
              childName,
            );
            if (childState) {
              agents.set(expected.name, childState);
            }
          }
          break;
        }
      }
      if (agents.has(expected.name)) {
        break;
      }
    }
  }

  // Fill nulls for any still-unmatched architecture agents
  for (const expected of expectedAgents) {
    if (!agents.has(expected.name)) {
      agents.set(expected.name, null);
    }
  }

  return { agents, detectedFolders: agentFolders };
}

// ────────────────────────────────────────────────────────────
//  Gap-Focused Pre-Build Report
// ────────────────────────────────────────────────────────────

/** Strip trailing version markers like (v2), (V2), v2 */
function stripVersion(s: string): string {
  return s
    .replace(/\(?\s*v\d+\s*\)?/gi, "")
    .replace(/\(\s*\)/g, "")
    .trim();
}

/**
 * Check whether an architecture tool name matches a detected action.
 * Uses multi-pass: exact → substring → display-name extraction → version-stripped.
 */
function toolMatchesAction(toolName: string, action: DetectedAction): boolean {
  const toolNorm = normalizeForMatch(toolName);
  const compNorm = normalizeForMatch(action.componentName);
  const dispNorm = normalizeForMatch(action.displayName);

  // Exact
  if (toolNorm === compNorm || toolNorm === dispNorm) {
    return true;
  }

  // Substring containment
  if (toolNorm.includes(compNorm) || compNorm.includes(toolNorm)) {
    return true;
  }
  if (
    dispNorm &&
    (toolNorm.includes(dispNorm) || dispNorm.includes(toolNorm))
  ) {
    return true;
  }

  // Extract display part after — / – / - separator
  const toolDisplay = toolName
    .replace(/^.*?[—–\-]\s*/, "")
    .replace(/`/g, "")
    .trim();
  if (toolDisplay && toolDisplay !== toolName) {
    const tdNorm = normalizeForMatch(toolDisplay);
    if (
      tdNorm === dispNorm ||
      dispNorm.includes(tdNorm) ||
      tdNorm.includes(dispNorm)
    ) {
      return true;
    }
    // Also try without version markers
    const tdNoVer = normalizeForMatch(stripVersion(toolDisplay));
    const dispNoVer = normalizeForMatch(stripVersion(action.displayName));
    if (
      tdNoVer &&
      dispNoVer &&
      (dispNoVer.includes(tdNoVer) || tdNoVer.includes(dispNoVer))
    ) {
      return true;
    }
  }

  return false;
}

/** Collect all connector actions across matched agents (parent + child) */
function collectAllActions(state: PreBuildState): DetectedAction[] {
  const all: DetectedAction[] = [];
  for (const agentState of state.agents.values()) {
    if (agentState) {
      all.push(...agentState.actions);
    }
  }
  return all;
}

/** Collect all child agent names across matched agents */
function collectAllChildAgents(state: PreBuildState): string[] {
  const all: string[] = [];
  for (const agentState of state.agents.values()) {
    if (agentState) {
      all.push(...agentState.childAgents);
    }
  }
  return all;
}

function collectAllTopics(state: PreBuildState): Array<{
  agentName: string;
  topicName: string;
}> {
  const all: Array<{ agentName: string; topicName: string }> = [];
  for (const [agentName, agentState] of state.agents.entries()) {
    if (!agentState) {
      continue;
    }
    for (const topicName of agentState.customTopics) {
      all.push({ agentName, topicName });
    }
  }
  return all;
}

function topicMatchesDetectedTopic(
  expected: ArchTopic,
  detected: string,
): boolean {
  const expectedNorm = normalizeForMatch(expected.name);
  const detectedNorm = normalizeForMatch(detected);

  if (!expectedNorm || !detectedNorm) {
    return false;
  }

  return (
    expectedNorm === detectedNorm ||
    expectedNorm.includes(detectedNorm) ||
    detectedNorm.includes(expectedNorm)
  );
}

function significantTopicTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .filter(
      (token) =>
        ![
          "topic",
          "user",
          "users",
          "agent",
          "request",
          "requests",
          "create",
          "update",
          "lookup",
          "intake",
        ].includes(token),
    );
}

function inferTopicConnectorRequirements(
  topic: ArchTopic,
  tools: ArchTool[],
): NormalizedConnectorRequirement[] {
  const topicText = [topic.name, topic.description, topic.keyBehaviour]
    .join(" ")
    .toLowerCase();
  const topicTokens = significantTopicTokens(topicText);

  if (topicTokens.length === 0) {
    return [];
  }

  const agentTools = tools.filter(
    (tool) =>
      tool.ownerAgent === topic.agentName &&
      !isFlowTool(tool) &&
      !isMcpTool(tool),
  );
  const matchedTools = agentTools.filter((tool) => {
    const toolTokens = significantTopicTokens(`${tool.name} ${tool.purpose}`);
    return toolTokens.some(
      (token) => topicText.includes(token) || topicTokens.includes(token),
    );
  });

  return buildNormalizedConnectorRequirements(matchedTools);
}

function buildDocumentationComplianceSummary(
  agents: ArchAgent[],
  tools: ArchTool[],
  knowledgeSources: ArchKnowledge[],
  manualSteps: string[],
): string[] {
  const aligned: string[] = [];
  const review: string[] = [];
  const manualChecks: string[] = [];

  if (agents.length === 1) {
    aligned.push(
      "Single-agent shape matches the repo preference for the smallest viable architecture unless later requirements force decomposition.",
    );
  } else if (
    agents.some((agent) => agent.type === "parent") &&
    agents.some((agent) => agent.type === "child" || agent.type === "connected")
  ) {
    aligned.push(
      "Multi-agent design includes an explicit parent-plus-specialist shape rather than an unmanaged cluster of overlapping agents.",
    );
  } else {
    review.push(
      "Multi-agent architecture should make the parent/child or parent/connected boundaries explicit before build.",
    );
  }

  const dataverseTools = tools.filter(isDataverseTool);
  if (dataverseTools.length > 0 && dataverseTools.length <= agents.length * 3) {
    aligned.push(
      "Dataverse tooling remains close to the preferred shared CRUD scaffold rather than a connector-per-table design.",
    );
  } else if (dataverseTools.length > agents.length * 3) {
    review.push(
      "Dataverse tooling looks granular for pre-build. Consolidate toward a shared read/write/delete pattern unless the architecture truly needs more specialized actions.",
    );
  }

  const childOwnedMcp = tools.filter((tool) => {
    if (!isMcpTool(tool)) {
      return false;
    }
    const owner = agents.find((agent) => agent.name === tool.ownerAgent);
    return owner?.type === "child";
  });
  if (childOwnedMcp.length > 0) {
    review.push(
      `Child-agent MCP ownership needs redesign or explicit parent justification: ${childOwnedMcp.map((tool) => tool.name).join(", ")}.`,
    );
  }

  const toolCountByAgent = new Map<string, number>();
  for (const agent of agents) {
    toolCountByAgent.set(agent.name, 0);
  }
  for (const tool of tools) {
    toolCountByAgent.set(
      tool.ownerAgent,
      (toolCountByAgent.get(tool.ownerAgent) || 0) + 1,
    );
  }
  for (const [agentName, count] of toolCountByAgent.entries()) {
    if (count > 30) {
      review.push(
        `${agentName} exceeds the practical 25-30 tool limit. Split or simplify before build to preserve routing quality.`,
      );
    }
  }

  if (
    knowledgeSources.length > 0 ||
    agents.some((agent) => agent.knowledgeSources.length > 0)
  ) {
    aligned.push(
      "Knowledge sources are present; keep descriptions specific and validate that content shape and size match CPS retrieval constraints during build.",
    );
  }

  if (tools.some(isFlowTool)) {
    manualChecks.push(
      "Review every Power Automate flow for run-as-author implications, approvals, and least-privilege connection design.",
    );
  }

  if (
    !manualSteps.some((step) =>
      step.toLowerCase().includes("content moderation"),
    )
  ) {
    manualChecks.push(
      "Add an explicit portal-only content moderation decision if the domain is likely to need a non-default setting.",
    );
  }

  const lines: string[] = ["## Documentation Compliance Summary", ""];

  if (aligned.length > 0) {
    lines.push("**Aligned With Repo Guidance**", "");
    for (const item of aligned) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (review.length > 0) {
    lines.push("**Needs Review Before Build**", "");
    for (const item of review) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (manualChecks.length > 0) {
    lines.push("**Manual CPS Checks Still Required**", "");
    for (const item of manualChecks) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (
    aligned.length === 0 &&
    review.length === 0 &&
    manualChecks.length === 0
  ) {
    lines.push(
      "- No architecture-level documentation compliance checks were triggered from the current draft.",
      "",
    );
  }

  return lines;
}

/**
 * Compose a gap-focused pre-build report. Compares architecture expectations
 * against detected agent state and highlights only remaining work.
 */
export function composePreBuildReport(
  spec: string,
  architecture: string,
  _requirementsDocs: Array<{ filename: string; content: string }>,
  state: PreBuildState,
): string {
  const agents = parseAgents(architecture);
  const tools = parseTools(architecture);
  const topics = parseTopics(architecture);
  const knowledgeSources = parseKnowledgeSources(architecture);
  const manualSteps = parseManualSteps(architecture);

  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");

  // ── Collect detected items across all matched agents ──
  const allActions = collectAllActions(state);
  const allChildAgents = collectAllChildAgents(state);
  const allTopics = collectAllTopics(state);

  const allDetectedWorkflows = new Set<string>();
  for (const agentState of state.agents.values()) {
    if (agentState) {
      for (const w of agentState.workflows) {
        allDetectedWorkflows.add(normalizeForMatch(w));
      }
    }
  }

  // ── Progress counters ──
  let totalAuto = 0;
  let foundAuto = 0;

  // Agents
  totalAuto += agents.length;
  const detectedAgents = agents.filter(
    (a) => state.agents.get(a.name) !== null,
  );
  foundAuto += detectedAgents.length;

  // Flow tools (detectable via workflows/)
  const flowTools = tools.filter(isFlowTool);
  totalAuto += flowTools.length;
  const foundFlowList = flowTools.filter((t) =>
    allDetectedWorkflows.has(normalizeForMatch(t.name)),
  );
  foundAuto += foundFlowList.length;

  // Connector tools (detectable via actions/)
  const nonFlowTools = tools.filter((t) => !isFlowTool(t));
  const connectorTools = nonFlowTools.filter((t) => !isMcpTool(t));
  const normalizedConnectorRequirements =
    buildNormalizedConnectorRequirements(connectorTools);
  const mcpTools = nonFlowTools.filter(isMcpTool);
  totalAuto += normalizedConnectorRequirements.length;
  const foundConnectorList = normalizedConnectorRequirements.filter((req) =>
    allActions.some((a) => toolMatchesAction(req.actionName, a)),
  );
  foundAuto += foundConnectorList.length;

  // Child agents (detectable via agents/ subdirectory)
  const archChildAgents = agents.filter((a) => a.type === "child");
  totalAuto += archChildAgents.length;
  const foundChildList = archChildAgents.filter((a) => {
    const norm = normalizeForMatch(a.name);
    return allChildAgents.some(
      (c) =>
        normalizeForMatch(c) === norm ||
        normalizeForMatch(c).includes(norm) ||
        norm.includes(normalizeForMatch(c)),
    );
  });
  foundAuto += foundChildList.length;

  // Topics (detectable via topics/)
  const architectureTopics = topics.filter(
    (topic) => !SYSTEM_TOPICS.has(normalizeForMatch(topic.name)),
  );
  totalAuto += architectureTopics.length;
  const foundTopicList = architectureTopics.filter((topic) =>
    allTopics.some(
      (detected) =>
        detected.agentName === topic.agentName &&
        topicMatchesDetectedTopic(topic, detected.topicName),
    ),
  );
  foundAuto += foundTopicList.length;

  const remaining = totalAuto - foundAuto;
  const allAutoComplete = remaining === 0;

  // Knowledge + MCP tools + manual steps are manual verification
  const agentKsList = agents.flatMap((a) =>
    a.knowledgeSources.map((ks) => ({ source: ks, agent: a.name })),
  );
  const normalizedKnowledgeSourceRequirements =
    buildNormalizedKnowledgeSourceRequirements(knowledgeSources, agentKsList);
  const detectedKnowledgeSources = collectAllKnowledgeSources(state);
  const missingKnowledgeSources = normalizedKnowledgeSourceRequirements.filter(
    (req) => {
      if (detectedKnowledgeSources.length === 0) {
        return true;
      }

      return !detectedKnowledgeSources.some((detected) =>
        knowledgeSourceMatches(req.source, detected.names),
      );
    },
  );
  const ksManualCount = missingKnowledgeSources.length;
  const totalManual = mcpTools.length + ksManualCount + manualSteps.length;

  const sections: string[] = [];

  // ── Header ──
  sections.push(
    "# Pre-Build Check",
    "",
    `**Generated**: ${timestamp}  `,
    `**CPSAgentKit version**: ${CURRENT_VERSION}`,
    "",
    "> **Before each check**: Run **Copilot Studio → Get Changes** in VS Code to sync the latest portal state to local YAML files. This check compares your architecture against those files.",
    "",
  );

  // ── Progress summary ──
  if (totalAuto > 0) {
    const pct = Math.round((foundAuto / totalAuto) * 100);
    sections.push(
      `**Auto-detected progress: ${foundAuto} / ${totalAuto} (${pct}%)**`,
    );
  }
  if (totalManual > 0) {
    sections.push(
      `**Manual verification items: ${totalManual}** (MCP tools, knowledge, portal steps)`,
    );
  }
  sections.push("");

  // ── All-clear shortcut ──
  if (allAutoComplete && totalManual === 0) {
    sections.push(
      "## ✅ All Clear — Ready for Build",
      "",
      "All expected agents, topics, tools, and flows have been detected. Proceed to the **Build** phase.",
      "",
    );
    return sections.join("\n");
  }

  if (allAutoComplete) {
    sections.push(
      "## ✅ Auto-Detection Complete",
      "",
      "All agents, topics, tools, and flows have been detected. Verify the manual items below, then proceed to **Build**.",
      "",
    );
  }

  // ── 1. Agents ──
  sections.push("## 1. Agents", "");
  const missingAgents = agents.filter((a) => state.agents.get(a.name) === null);
  if (missingAgents.length === 0) {
    sections.push("All required agents are already present.", "");
    for (const a of detectedAgents) {
      sections.push(`- ✅ Agent ready: **${a.name}**`);
    }
    sections.push("");
  } else {
    for (const a of missingAgents) {
      sections.push(`- [ ] Add agent: **${a.name}** (${a.type})`);
    }
    sections.push("");
  }

  // ── 2. Tools & Connectors ──
  if (tools.length > 0) {
    sections.push("## 2. Tools & Connectors", "");

    // Connector tools (auto-detectable from actions/)
    if (normalizedConnectorRequirements.length > 0) {
      const missingConnectors = normalizedConnectorRequirements.filter(
        (req) => !allActions.some((a) => toolMatchesAction(req.actionName, a)),
      );
      if (missingConnectors.length === 0) {
        sections.push(
          "All required connector actions are already present.",
          "",
        );
      } else {
        sections.push("Add each connector action type shown below once.", "");
        for (const req of missingConnectors) {
          sections.push(...formatNormalizedConnectorRequirement(req));
          sections.push("");
        }
      }
    }

    // Flow tools (auto-detectable from workflows/)
    if (flowTools.length > 0) {
      const missingFlows = flowTools.filter(
        (t) => !allDetectedWorkflows.has(normalizeForMatch(t.name)),
      );
      if (missingFlows.length === 0) {
        sections.push("All required flow tools are already present.", "");
      } else {
        for (const t of missingFlows) {
          sections.push(formatToolChecklistItem(t, "flow"));
        }
        sections.push("");
      }
    }

    // MCP tools (manual verification)
    if (mcpTools.length > 0) {
      sections.push("MCP tools are manual portal checks:", "");
      for (const t of mcpTools) {
        sections.push(formatToolChecklistItem(t, "MCP tool"));
      }
      sections.push("");
    }
  }

  // ── 3. Topics ──
  if (architectureTopics.length > 0) {
    sections.push("## 3. Topics", "");

    const missingTopics = architectureTopics.filter(
      (topic) =>
        !allTopics.some(
          (detected) =>
            detected.agentName === topic.agentName &&
            topicMatchesDetectedTopic(topic, detected.topicName),
        ),
    );

    if (missingTopics.length === 0) {
      sections.push("All required topics are already present.", "");
    } else {
      for (const topic of missingTopics) {
        sections.push(`- [ ] Create Topic ${topic.name}`);

        const purposeParts = [topic.description, topic.keyBehaviour].filter(
          Boolean,
        );
        if (purposeParts.length > 0) {
          sections.push(`  - Purpose: ${purposeParts.join(" ")}`);
        }

        const topicConnectors = inferTopicConnectorRequirements(
          topic,
          tools,
        ).filter(
          (req) =>
            !allActions.some((a) => toolMatchesAction(req.actionName, a)),
        );

        for (const req of topicConnectors) {
          sections.push(`  - Add ${req.actionName} Tool to Topic`);
        }
      }
      sections.push("");
    }
  }

  // ── 4. Knowledge Sources ──
  const hasKs =
    knowledgeSources.length > 0 ||
    agents.some((a) => a.knowledgeSources.length > 0);
  if (hasKs) {
    sections.push("## 4. Knowledge Sources", "");
    if (missingKnowledgeSources.length === 0) {
      sections.push("All required knowledge sources are already present.", "");
    } else {
      for (const ks of missingKnowledgeSources) {
        sections.push(formatKnowledgeSourceChecklistItem(ks));
      }
      sections.push("");
    }
  }

  // ── 5. Manual Portal Steps ──
  if (manualSteps.length > 0) {
    sections.push("## 5. Manual Portal Steps", "");
    for (const step of manualSteps) {
      sections.push(`- [ ] ${normalizeManualPortalStep(step)}`);
    }
    sections.push("");
  }

  // ── 6. Settings Coherence ──
  const settingsChecks: string[] = [];
  for (const [agentName, agentState] of state.agents) {
    if (!agentState) {
      continue;
    }
    const s = agentState.settings;
    if (s.useModelKnowledge === true) {
      settingsChecks.push(
        `- [ ] Review **${agentName}** setting: \`useModelKnowledge: true\``,
      );
    }
    if (s.webBrowsing === true) {
      settingsChecks.push(
        `- [ ] Review **${agentName}** setting: \`webBrowsing: true\``,
      );
    }
    if (s.isSemanticSearchEnabled === true && !s.hasKnowledgeSources) {
      settingsChecks.push(
        `- [ ] Review **${agentName}** setting: \`isSemanticSearchEnabled: true\` with no detected knowledge sources`,
      );
    }
    if (s.isFileAnalysisEnabled === true) {
      settingsChecks.push(
        `- [ ] Review **${agentName}** setting: \`isFileAnalysisEnabled: true\``,
      );
    }
  }
  if (settingsChecks.length > 0) {
    sections.push(
      "## 6. Settings Coherence",
      "",
      ...settingsChecks,
      "",
      "- [ ] Set the content moderation level in the Copilot Studio portal if the architecture requires a non-default setting",
      "",
    );
  }

  // ── Next Steps ──
  sections.push("---", "");
  if (remaining > 0) {
    sections.push(
      "## Next Steps",
      "",
      "1. Add the missing scaffold items in Copilot Studio",
      "2. Run **Copilot Studio → Get Changes** to sync local files",
      "3. Run **CPSAgentKit: Run Pre-Build** again to re-check",
      "",
    );
  } else {
    sections.push(
      "## Next Steps",
      "",
      "The manual pre-build checklist is complete.",
      totalManual > 0
        ? "Verify the manual items above, then run this check again if you make further portal changes."
        : "Proceed when you are ready for the Build phase.",
      "",
    );
  }

  return sections.join("\n");
}
