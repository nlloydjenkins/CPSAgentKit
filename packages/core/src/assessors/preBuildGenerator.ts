import * as fs from "fs/promises";
import * as path from "path";
import {
  readMarkdownFiles,
  fileExists,
  findCpsAgentFolders,
} from "../fs/fileUtils.js";
import { CORE_VERSION as CURRENT_VERSION } from "../version.js";
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
