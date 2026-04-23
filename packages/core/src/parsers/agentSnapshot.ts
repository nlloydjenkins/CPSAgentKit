/**
 * Read and format CPS agent folders on disk.
 *
 * An "agent folder" contains `settings.yaml` (or `settings.mcs.yml`) and a
 * `topics/` directory. See `findCpsAgentFolders` for discovery.
 */
import * as fs from "fs/promises";
import * as path from "path";
import {
  readYamlFiles,
  readMarkdownFiles,
  findCpsAgentFolders,
} from "../fs/fileUtils.js";
import type { AgentSnapshot } from "../types/index.js";

export type { AgentSnapshot } from "../types/index.js";

/** Read all files for a single CPS agent folder */
export async function readAgentSnapshot(
  workspaceRoot: string,
  agentName: string,
): Promise<AgentSnapshot> {
  const agentDir = path.join(workspaceRoot, agentName);

  // Read settings — try both naming conventions
  let settings = "";
  for (const name of ["settings.yaml", "settings.mcs.yml"]) {
    try {
      settings = await fs.readFile(path.join(agentDir, name), "utf-8");
      break;
    } catch {
      // Try next
    }
  }

  // Read agent config (agent.mcs.yml) — separate from settings
  let agentConfig = "";
  try {
    agentConfig = await fs.readFile(
      path.join(agentDir, "agent.mcs.yml"),
      "utf-8",
    );
  } catch {
    // No agent config file
  }

  // Read connection references
  let connectionReferences = "";
  try {
    connectionReferences = await fs.readFile(
      path.join(agentDir, "connectionreferences.mcs.yml"),
      "utf-8",
    );
  } catch {
    // No connection references file
  }

  const topics = await readYamlFiles(path.join(agentDir, "topics"));
  const actions = await readYamlFiles(path.join(agentDir, "actions"));
  const knowledge = [
    ...(await readYamlFiles(path.join(agentDir, "knowledge"))),
    ...(await readMarkdownFiles(path.join(agentDir, "knowledge"))),
  ];

  return {
    name: agentName,
    settings,
    agentConfig,
    connectionReferences,
    topics,
    actions,
    knowledge,
  };
}

/** Read all agent snapshots from the workspace */
export async function gatherAgentSnapshot(
  workspaceRoot: string,
): Promise<AgentSnapshot[]> {
  const agentNames = await findCpsAgentFolders(workspaceRoot);
  const agents: AgentSnapshot[] = [];
  for (const name of agentNames) {
    agents.push(await readAgentSnapshot(workspaceRoot, name));
  }
  return agents;
}

/** Strip noisy XML elements from settings content (e.g. iconbase64, synchronizationstatus) */
export function stripSettingsNoise(settings: string): string {
  let result = settings.replace(/<iconbase64>[\s\S]*?<\/iconbase64>/g, "");
  result = result.replace(
    /<synchronizationstatus>[\s\S]*?<\/synchronizationstatus>/g,
    "",
  );
  result = result.replace(/\n{3,}/g, "\n\n");
  return result;
}

/** Detect the likely format of file content for fenced code blocks */
export function detectFenceLanguage(content: string): string {
  const trimmed = content.trimStart();
  if (trimmed.startsWith("<") || trimmed.startsWith("<?xml")) {
    return "xml";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json";
  }
  return "yaml";
}

/** Format agent snapshots as markdown sections for inclusion in prompts */
export function formatAgentSnapshotMarkdown(agents: AgentSnapshot[]): string {
  const sections: string[] = [];
  for (const agent of agents) {
    sections.push(`### Agent: ${agent.name}`, "");

    const cleanSettings = stripSettingsNoise(agent.settings);
    const settingsFence = detectFenceLanguage(cleanSettings);
    sections.push(
      "#### settings",
      "```" + settingsFence,
      cleanSettings,
      "```",
      "",
    );

    if (agent.agentConfig) {
      const configFence = detectFenceLanguage(agent.agentConfig);
      sections.push(
        "#### agent config",
        "```" + configFence,
        agent.agentConfig,
        "```",
        "",
      );
    }

    if (agent.connectionReferences) {
      sections.push(
        "#### connection references",
        "```yaml",
        agent.connectionReferences,
        "```",
        "",
      );
    }

    if (agent.topics.length > 0) {
      sections.push("#### topics", "");
      for (const t of agent.topics) {
        const topicFence = detectFenceLanguage(t.content);
        sections.push(
          `**${t.filename}**`,
          "```" + topicFence,
          t.content,
          "```",
          "",
        );
      }
    }

    if (agent.actions.length > 0) {
      sections.push("#### actions", "");
      for (const a of agent.actions) {
        const actionFence = detectFenceLanguage(a.content);
        sections.push(
          `**${a.filename}**`,
          "```" + actionFence,
          a.content,
          "```",
          "",
        );
      }
    }

    if (agent.knowledge.length > 0) {
      sections.push("#### knowledge", "");
      for (const k of agent.knowledge) {
        const fence = k.filename.endsWith(".md")
          ? "markdown"
          : detectFenceLanguage(k.content);
        sections.push(`**${k.filename}**`, "```" + fence, k.content, "```", "");
      }
    }
  }
  return sections.join("\n");
}

/** Read all knowledge files from a knowledge directory */
export async function readKnowledgeRules(
  extensionPath: string,
): Promise<Array<{ filename: string; content: string }>> {
  const knowledgeDir = path.join(extensionPath, "docs", "knowledge");
  return readMarkdownFiles(knowledgeDir);
}

/** Read requirements docs if they exist */
export async function readRequirementsDocs(workspaceRoot: string): Promise<{
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

/** Read best practice documents from .cpsagentkit/bestpractices/ */
export async function readBestPracticesDocs(
  workspaceRoot: string,
): Promise<Array<{ filename: string; content: string }>> {
  const bpDir = path.join(workspaceRoot, ".cpsagentkit", "bestpractices");
  return readMarkdownFiles(bpDir);
}

/** Gather the full solution snapshot: all agents + knowledge rules + requirements + best practices */
export async function gatherSolutionSnapshot(
  workspaceRoot: string,
  extensionPath: string,
): Promise<{
  agents: AgentSnapshot[];
  knowledgeRules: Array<{ filename: string; content: string }>;
  requirements: {
    spec: string;
    architecture: string;
    docs: Array<{ filename: string; content: string }>;
  };
  bestPractices: Array<{ filename: string; content: string }>;
}> {
  const agentNames = await findCpsAgentFolders(workspaceRoot);
  const agents: AgentSnapshot[] = [];
  for (const name of agentNames) {
    agents.push(await readAgentSnapshot(workspaceRoot, name));
  }

  const knowledgeRules = await readKnowledgeRules(extensionPath);
  const requirements = await readRequirementsDocs(workspaceRoot);
  const bestPractices = await readBestPracticesDocs(workspaceRoot);

  return { agents, knowledgeRules, requirements, bestPractices };
}
