import * as fs from "fs/promises";
import * as path from "path";

export interface ToolDescriptionUpdate {
  filePath: string;
  displayName: string;
  matchedTool: string | null;
  updated: boolean;
  usedFallback: boolean;
  reason?: string;
}

export interface ApplyToolDescriptionsResult {
  updates: ToolDescriptionUpdate[];
  matchedSpecs: string[];
  unmatchedSpecs: string[];
}

export interface TopicCustomisationResult {
  updatedTopicFiles: string[];
  updatedTriggerFiles: string[];
  missingSystemTopics: string[];
}

interface ToolDescriptionSpec {
  toolName: string;
  description: string;
}

interface TriggerDescriptionSpec {
  triggerId: string;
  description: string;
}

interface ArchitectureTopicSpec {
  name: string;
  description: string;
}

interface ArchitectureAgentSpec {
  name: string;
  type: string;
}

const SYSTEM_TOPIC_ALIASES = new Map<string, string[]>([
  [
    "conversation start",
    ["conversation start", "conversationstart", "greeting"],
  ],
  ["fallback", ["fallback"]],
  ["escalate", ["escalate", "escalation"]],
  ["on error", ["on error", "onerror"]],
]);

export async function applyToolDescriptionsFromArchitecture(
  agentRoot: string,
  architecture: string,
): Promise<ApplyToolDescriptionsResult> {
  const descriptionSpecs = parseToolDescriptionSpecs(architecture);
  const fallbackTools = parseToolsAndConnectors(architecture);
  const actionFiles = await collectActionFiles(agentRoot);

  const updates: ToolDescriptionUpdate[] = [];
  const matchedSpecs = new Set<string>();

  for (const filePath of actionFiles) {
    const content = await fs.readFile(filePath, "utf-8");
    const displayName = parseYamlScalar(content, "modelDisplayName") || "";
    const componentName =
      parseComponentName(content) || path.basename(filePath, ".mcs.yml");

    let matched = findMatchingToolSpec(
      descriptionSpecs,
      displayName,
      componentName,
      filePath,
    );
    let usedFallback = false;

    if (!matched) {
      const fallback = findMatchingToolSpec(
        fallbackTools,
        displayName,
        componentName,
        filePath,
      );
      if (fallback) {
        usedFallback = true;
        matched = {
          toolName: fallback.toolName,
          description: buildFallbackToolDescription(fallback.description),
        };
      }
    }

    if (!matched) {
      updates.push({
        filePath,
        displayName,
        matchedTool: null,
        updated: false,
        usedFallback: false,
        reason: "No matching tool description found in architecture",
      });
      continue;
    }

    matchedSpecs.add(matched.toolName);
    const nextContent = setOrInsertYamlScalar(
      content,
      "modelDescription",
      matched.description,
      "modelDisplayName",
    );

    if (nextContent !== content) {
      await fs.writeFile(filePath, nextContent, "utf-8");
      updates.push({
        filePath,
        displayName,
        matchedTool: matched.toolName,
        updated: true,
        usedFallback,
      });
      continue;
    }

    updates.push({
      filePath,
      displayName,
      matchedTool: matched.toolName,
      updated: false,
      usedFallback,
      reason: "modelDescription already matched generated value",
    });
  }

  const unmatchedSpecs = descriptionSpecs
    .map((spec) => spec.toolName)
    .filter((toolName) => !matchedSpecs.has(toolName));

  return {
    updates,
    matchedSpecs: [...matchedSpecs],
    unmatchedSpecs,
  };
}

export async function applyTopicAndTriggerCustomisationsFromArchitecture(
  agentRoot: string,
  architecture: string,
): Promise<TopicCustomisationResult> {
  const topicsDir = path.join(agentRoot, "topics");
  const triggerDir = path.join(agentRoot, "trigger");

  const topicSpecs = parseArchitectureTopics(architecture);
  const systemSpecs = buildSystemTopicSpecs(architecture, topicSpecs);
  const triggerSpecs = parseTriggerDescriptionSpecs(architecture);

  const updatedTopicFiles: string[] = [];
  const updatedTriggerFiles: string[] = [];
  const missingSystemTopics: string[] = [];

  const topicFiles = await safeReadDir(topicsDir);
  const seenSystemTopics = new Set<string>();

  for (const fileName of topicFiles.filter((name) =>
    name.endsWith(".mcs.yml"),
  )) {
    const filePath = path.join(topicsDir, fileName);
    const content = await fs.readFile(filePath, "utf-8");
    const componentName =
      parseComponentName(content) || path.basename(fileName, ".mcs.yml");
    const normalizedName = normalizeForMatch(componentName);

    let nextContent = content;

    const topicSpec = topicSpecs.find(
      (spec) => normalizeForMatch(spec.name) === normalizedName,
    );
    if (topicSpec) {
      nextContent = setOrInsertYamlScalar(
        nextContent,
        "description",
        topicSpec.description,
        "componentName",
      );
      nextContent = setOrInsertYamlScalar(
        nextContent,
        "modelDescription",
        topicSpec.description,
        "kind",
      );
    }

    for (const [systemKey, aliases] of SYSTEM_TOPIC_ALIASES) {
      if (!aliases.includes(normalizedName)) {
        continue;
      }

      seenSystemTopics.add(systemKey);
      const spec = systemSpecs.get(systemKey);
      if (!spec) {
        break;
      }

      nextContent = setOrInsertYamlScalar(
        nextContent,
        "description",
        spec.description,
        "componentName",
      );
      if (spec.activityText) {
        nextContent = replaceFirstActivityTextValue(
          nextContent,
          spec.activityText,
        );
      }
      if (spec.speakText) {
        nextContent = replaceFirstActivitySpeakValue(
          nextContent,
          spec.speakText,
        );
      }
      break;
    }

    if (nextContent !== content) {
      await fs.writeFile(filePath, nextContent, "utf-8");
      updatedTopicFiles.push(filePath);
    }
  }

  for (const systemKey of SYSTEM_TOPIC_ALIASES.keys()) {
    if (!seenSystemTopics.has(systemKey)) {
      missingSystemTopics.push(systemKey);
    }
  }

  const triggerFiles = await safeReadDir(triggerDir);
  for (const fileName of triggerFiles.filter((name) =>
    name.endsWith(".mcs.yml"),
  )) {
    const filePath = path.join(triggerDir, fileName);
    const content = await fs.readFile(filePath, "utf-8");
    const componentName =
      parseComponentName(content) || path.basename(fileName, ".mcs.yml");
    const triggerSpec = triggerSpecs.find(
      (spec) =>
        normalizeForMatch(spec.triggerId) === normalizeForMatch(componentName),
    );
    if (!triggerSpec) {
      continue;
    }

    const nextContent = setOrInsertYamlScalar(
      content,
      "description",
      triggerSpec.description,
      "componentName",
    );
    if (nextContent !== content) {
      await fs.writeFile(filePath, nextContent, "utf-8");
      updatedTriggerFiles.push(filePath);
    }
  }

  return {
    updatedTopicFiles,
    updatedTriggerFiles,
    missingSystemTopics,
  };
}

function parseToolDescriptionSpecs(
  architecture: string,
): ToolDescriptionSpec[] {
  const sectionNames = [
    "Tool Descriptions",
    "Dataverse Connector Tool Descriptions",
  ];
  const specs = new Map<string, ToolDescriptionSpec>();

  for (const sectionName of sectionNames) {
    const section = extractSection(architecture, sectionName);
    if (!section) {
      continue;
    }

    for (const row of parseMarkdownTable(section)) {
      if (row.length < 2) {
        continue;
      }
      const toolName = row[0];
      const description = row[row.length - 1];
      if (!toolName || !description) {
        continue;
      }
      specs.set(normalizeForMatch(toolName), {
        toolName,
        description: normalizeInlineText(description),
      });
    }

    const headingBlocks = section
      .split(/^### /m)
      .filter((block) => block.trim());
    for (const block of headingBlocks) {
      const lines = block.split("\n");
      const toolName = lines[0].trim();
      const description = normalizeInlineText(lines.slice(1).join(" "));
      if (!toolName || !description) {
        continue;
      }
      specs.set(normalizeForMatch(toolName), { toolName, description });
    }

    for (const line of section.split("\n")) {
      const match = line.match(/^\s*[-*]\s+\*\*([^*]+)\*\*:\s*(.+)$/);
      if (!match) {
        continue;
      }
      const toolName = match[1].trim();
      const description = normalizeInlineText(match[2]);
      if (!toolName || !description) {
        continue;
      }
      specs.set(normalizeForMatch(toolName), { toolName, description });
    }
  }

  return [...specs.values()];
}

function parseTriggerDescriptionSpecs(
  architecture: string,
): TriggerDescriptionSpec[] {
  const section = extractSection(architecture, "Autonomous Triggers");
  if (!section) {
    return [];
  }

  const specs: TriggerDescriptionSpec[] = [];
  for (const row of parseMarkdownTable(section)) {
    if (row.length < 5) {
      continue;
    }
    const [triggerId, schedule, operation, ownerAgent, delegatesTo] = row;
    if (!triggerId || !schedule || !operation) {
      continue;
    }
    const parts = [
      `${triggerId} ${operation}.`,
      `Runs ${schedule}.`,
      ownerAgent ? `Owned by ${ownerAgent}.` : "",
      delegatesTo && delegatesTo !== "-" ? `Delegates to ${delegatesTo}.` : "",
    ].filter(Boolean);
    specs.push({
      triggerId,
      description: normalizeInlineText(parts.join(" ")),
    });
  }
  return specs;
}

function parseArchitectureTopics(
  architecture: string,
): ArchitectureTopicSpec[] {
  const topics: ArchitectureTopicSpec[] = [];
  const agentsSection = extractSection(architecture, "Agents");
  if (!agentsSection) {
    return topics;
  }

  const match = agentsSection.match(
    /### Topics\s*\n([\s\S]*?)(?=\n### |\n## |$(?![\s\S]))/,
  );
  if (!match) {
    return topics;
  }

  for (const row of parseMarkdownTable(match[1])) {
    if (row.length < 2) {
      continue;
    }
    const [name, description] = row;
    if (!name || !description) {
      continue;
    }
    topics.push({
      name,
      description: normalizeInlineText(description),
    });
  }

  return topics;
}

function parseArchitectureAgents(
  architecture: string,
): ArchitectureAgentSpec[] {
  const agents: ArchitectureAgentSpec[] = [];
  const section = extractSection(architecture, "Agents");
  if (!section) {
    return agents;
  }

  const blocks = section.split(/^### /m).filter((block) => block.trim());
  for (const block of blocks) {
    const lines = block.split("\n");
    const name = lines[0].trim();
    if (!name || name.toLowerCase() === "topics") {
      continue;
    }
    const typeLine = lines.find((line) => /\*\*Type:\*\*/.test(line));
    const typeMatch = typeLine?.match(/\*\*Type:\*\*\s*(.+)$/);
    agents.push({
      name,
      type: typeMatch?.[1]?.trim() || "",
    });
  }

  return agents;
}

function parseToolsAndConnectors(architecture: string): ToolDescriptionSpec[] {
  const section = extractSection(architecture, "Tools & Connectors");
  if (!section) {
    return [];
  }

  const specs: ToolDescriptionSpec[] = [];
  for (const row of parseMarkdownTable(section)) {
    if (row.length < 3) {
      continue;
    }
    const toolName = row[0];
    const purpose = row[row.length - 2];
    if (!toolName || !purpose) {
      continue;
    }
    specs.push({
      toolName,
      description: normalizeInlineText(purpose),
    });
  }
  return specs;
}

function buildSystemTopicSpecs(
  architecture: string,
  topics: ArchitectureTopicSpec[],
): Map<
  string,
  { description: string; activityText?: string; speakText?: string }
> {
  const agents = parseArchitectureAgents(architecture);
  const primaryAgent =
    agents.find((agent) => /parent|standalone/i.test(agent.type))?.name ||
    agents[0]?.name ||
    "this agent";
  const capabilityNames = uniqueStrings(
    topics.map((topic) => topic.name),
  ).slice(0, 6);
  const capabilityBullets = capabilityNames
    .map((name) => `- ${name}`)
    .join("\\n");
  const capabilitySentence = humanJoin(capabilityNames);
  const helpContact = extractEscalationContact(architecture);

  const specs = new Map<
    string,
    { description: string; activityText?: string; speakText?: string }
  >();

  specs.set("conversation start", {
    description: normalizeInlineText(
      `Welcomes the user to ${primaryAgent} and lists the supported capabilities defined in the architecture before routing. Does NOT claim capabilities outside the configured topics.`,
    ),
    activityText: `Welcome to ${primaryAgent}. I can help you with:\n\n${capabilityBullets || "- the capabilities defined in the architecture"}\n\nWhat would you like to do?`,
    speakText: `Welcome to ${primaryAgent}. I can help you with ${capabilitySentence || "the configured capabilities"}. What would you like to do?`,
  });

  specs.set("fallback", {
    description: normalizeInlineText(
      `Handles messages that do not match any configured topic. Guides the user back to supported capabilities and escalates after repeated failures. Does NOT guess answers outside the configured domain.`,
    ),
    activityText: `I'm not sure how to help with that. I can assist with:\n\n${capabilityBullets || "- the capabilities defined in the architecture"}\n\nCould you rephrase your request?`,
  });

  specs.set("escalate", {
    description: normalizeInlineText(
      `Handles requests to speak to a person or situations the agent cannot resolve. Provides ${helpContact}. Does NOT continue trying to answer unsupported or blocked requests.`,
    ),
    activityText: `I can help you reach a person for this request. ${helpContact}`,
  });

  specs.set("on error", {
    description: normalizeInlineText(
      `Handles unexpected runtime errors. In test mode it should expose diagnostic details. In production it should provide a safe error message, log the incident, and end the conversation cleanly.`,
    ),
  });

  return specs;
}

function extractEscalationContact(architecture: string): string {
  const manualSection =
    extractSection(architecture, "Manual Portal Steps") || architecture;
  const lines = manualSection
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!/support|helpdesk|escalat|mailbox|email|phone|call/i.test(line)) {
      continue;
    }
    return line.replace(/^\d+\.\s*/, "").replace(/^[-*]\s*/, "");
  }

  return "the support route defined in the architecture's manual portal steps.";
}

function findMatchingToolSpec(
  specs: ToolDescriptionSpec[],
  displayName: string,
  componentName: string,
  filePath: string,
): ToolDescriptionSpec | null {
  const fileBase = path.basename(filePath, ".mcs.yml");
  const candidates = [displayName, componentName, fileBase].filter(Boolean);

  for (const candidate of candidates) {
    const exact = specs.find(
      (spec) =>
        normalizeForMatch(spec.toolName) === normalizeForMatch(candidate),
    );
    if (exact) {
      return exact;
    }
  }

  for (const candidate of candidates) {
    const candidateNorm = normalizeForMatch(candidate);
    const partial = specs.find((spec) => {
      const specNorm = normalizeForMatch(spec.toolName);
      return (
        candidateNorm.includes(specNorm) || specNorm.includes(candidateNorm)
      );
    });
    if (partial) {
      return partial;
    }
  }

  for (const candidate of candidates) {
    const candidateNorm = normalizeForMatch(
      stripVersion(stripToolPrefix(candidate)),
    );
    const partial = specs.find((spec) => {
      const specNorm = normalizeForMatch(
        stripVersion(stripToolPrefix(spec.toolName)),
      );
      return (
        candidateNorm &&
        specNorm &&
        (candidateNorm.includes(specNorm) || specNorm.includes(candidateNorm))
      );
    });
    if (partial) {
      return partial;
    }
  }

  return null;
}

async function collectActionFiles(agentRoot: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dirPath: string): Promise<void> {
    const entries = await safeReadDirents(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (
        entry.isFile() &&
        fullPath.endsWith(".mcs.yml") &&
        fullPath.includes(`${path.sep}actions${path.sep}`)
      ) {
        files.push(fullPath);
      }
    }
  }

  await walk(agentRoot);
  return files;
}

async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

async function safeReadDirents(
  dirPath: string,
): Promise<Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function parseMarkdownTable(section: string): string[][] {
  const rows: string[][] = [];
  for (const line of section.split("\n")) {
    if (!line.trim().startsWith("|")) {
      continue;
    }
    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cells.length < 2) {
      continue;
    }
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      continue;
    }
    const firstLower = cells[0].toLowerCase();
    const lastLower = cells[cells.length - 1].toLowerCase();
    if (
      firstLower === "tool" ||
      firstLower === "source" ||
      firstLower === "trigger id" ||
      lastLower === "description" ||
      lastLower === "manual portal step required"
    ) {
      continue;
    }
    rows.push(cells);
  }
  return rows;
}

function extractSection(content: string, heading: string): string | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `^## ${escapedHeading}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$(?![\\s\\S]))`,
    "m",
  );
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function setOrInsertYamlScalar(
  content: string,
  key: string,
  value: string,
  insertAfterKey?: string,
): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineRegex = new RegExp(`(^[ \\t]*${escapedKey}:\\s*)(.+)$`, "m");
  if (lineRegex.test(content)) {
    return content.replace(lineRegex, `$1${yamlInline(value)}`);
  }

  if (!insertAfterKey) {
    return content;
  }

  const escapedAfterKey = insertAfterKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const insertRegex = new RegExp(`(^[ \\t]*${escapedAfterKey}:.*$)`, "m");
  if (!insertRegex.test(content)) {
    return content;
  }

  return content.replace(insertRegex, `$1\n${key}: ${yamlInline(value)}`);
}

function replaceFirstActivityTextValue(content: string, value: string): string {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("activity:")) {
      continue;
    }

    if (trimmed !== "activity:") {
      const indent = lines[i].match(/^\s*/)?.[0] || "";
      lines[i] = `${indent}activity: ${yamlInline(value)}`;
      return lines.join("\n");
    }

    for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
      const childTrimmed = lines[j].trim();
      if (childTrimmed === "text:" && j + 1 < lines.length) {
        const indent = lines[j + 1].match(/^\s*/)?.[0] || "";
        lines[j + 1] = `${indent}- ${yamlInline(value)}`;
        return lines.join("\n");
      }
      if (
        childTrimmed.startsWith("- kind:") ||
        childTrimmed.startsWith("id:")
      ) {
        break;
      }
    }
  }
  return content;
}

function replaceFirstActivitySpeakValue(
  content: string,
  value: string,
): string {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "speak:") {
      continue;
    }
    if (i + 1 >= lines.length) {
      break;
    }
    const indent = lines[i + 1].match(/^\s*/)?.[0] || "";
    lines[i + 1] = `${indent}- ${yamlInline(value)}`;
    return lines.join("\n");
  }
  return content;
}

function parseComponentName(yamlContent: string): string {
  const match = yamlContent.match(/^\s*componentName:\s*(.+)$/m);
  return match ? stripWrappingQuotes(match[1].trim()) : "";
}

function parseYamlScalar(content: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^\\s*${escapedKey}:\\s*(.+)$`, "m"));
  return match ? stripWrappingQuotes(match[1].trim()) : null;
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}

function normalizeInlineText(value: string): string {
  return value
    .replace(/<!--.*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripVersion(value: string): string {
  return value
    .replace(/\(?\s*v\d+\s*\)?/gi, "")
    .replace(/\(\s*\)/g, "")
    .trim();
}

function stripToolPrefix(value: string): string {
  return value.replace(/^.*?[—–\-]\s*/, "").trim();
}

function yamlInline(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")}"`;
}

function buildFallbackToolDescription(purpose: string): string {
  const normalizedPurpose = normalizeInlineText(purpose);
  if (!normalizedPurpose) {
    return "Use this tool only for the purpose defined in the architecture. Do not use it for unrelated tasks.";
  }
  const sentence = /[.!?]$/.test(normalizedPurpose)
    ? normalizedPurpose
    : `${normalizedPurpose}.`;
  return `${sentence} Call this tool when the user request clearly matches this capability. Do NOT use it for unrelated tasks.`;
}

function humanJoin(values: string[]): string {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return values[0];
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
