import * as fs from "fs/promises";
import * as path from "path";

/** A single CPS agent's files, grouped for review */
export interface AgentSnapshot {
  name: string;
  settings: string;
  topics: Array<{ filename: string; content: string }>;
  actions: Array<{ filename: string; content: string }>;
  knowledge: Array<{ filename: string; content: string }>;
}

/** Read all YAML files from a directory, returns name+content pairs */
async function readYamlFiles(
  dir: string,
): Promise<Array<{ filename: string; content: string }>> {
  const files: Array<{ filename: string; content: string }> = [];
  try {
    const entries = await fs.readdir(dir);
    const yamls = entries
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .sort();
    for (const filename of yamls) {
      const content = await fs.readFile(path.join(dir, filename), "utf-8");
      files.push({ filename, content });
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return files;
}

/** Read all markdown files from a directory */
async function readMarkdownFiles(
  dir: string,
): Promise<Array<{ filename: string; content: string }>> {
  const files: Array<{ filename: string; content: string }> = [];
  try {
    const entries = await fs.readdir(dir);
    const mds = entries.filter((f) => f.endsWith(".md")).sort();
    for (const filename of mds) {
      const content = await fs.readFile(path.join(dir, filename), "utf-8");
      files.push({ filename, content });
    }
  } catch {
    // Directory doesn't exist
  }
  return files;
}

/**
 * Detect CPS agent folders in the workspace — directories containing
 * both settings.yaml (or settings.mcs.yml) and a topics/ subdirectory.
 */
async function findAgentFolders(workspaceRoot: string): Promise<string[]> {
  const agents: string[] = [];
  try {
    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }
      const dir = path.join(workspaceRoot, entry.name);
      // Check for CPS agent markers
      const hasSettings =
        (await fileExists(path.join(dir, "settings.yaml"))) ||
        (await fileExists(path.join(dir, "settings.mcs.yml")));
      const hasTopics = await fileExists(path.join(dir, "topics"));
      if (hasSettings && hasTopics) {
        agents.push(entry.name);
      }
    }
  } catch {
    // Workspace listing failed
  }
  return agents;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Read all files for a single CPS agent folder */
async function readAgentSnapshot(
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

  const topics = await readYamlFiles(path.join(agentDir, "topics"));
  const actions = await readYamlFiles(path.join(agentDir, "actions"));
  const knowledge = [
    ...(await readYamlFiles(path.join(agentDir, "knowledge"))),
    ...(await readMarkdownFiles(path.join(agentDir, "knowledge"))),
  ];

  return { name: agentName, settings, topics, actions, knowledge };
}

/** Read all knowledge files from .cpsagentkit/knowledge/ */
async function readKnowledgeRules(
  extensionPath: string,
): Promise<Array<{ filename: string; content: string }>> {
  const knowledgeDir = path.join(extensionPath, "docs", "knowledge");
  return readMarkdownFiles(knowledgeDir);
}

/** Read requirements docs if they exist */
async function readRequirementsDocs(workspaceRoot: string): Promise<{
  spec: string;
  architecture: string;
  docs: Array<{ filename: string; content: string }>;
}> {
  const reqDir = path.join(workspaceRoot, "requirements");
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

/** Read user-provided best practice documents from docs/bestpractices/ */
async function readBestPracticesDocs(
  workspaceRoot: string,
): Promise<Array<{ filename: string; content: string }>> {
  const bpDir = path.join(workspaceRoot, "docs", "bestpractices");
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
  const agentNames = await findAgentFolders(workspaceRoot);
  const agents: AgentSnapshot[] = [];
  for (const name of agentNames) {
    agents.push(await readAgentSnapshot(workspaceRoot, name));
  }

  const knowledgeRules = await readKnowledgeRules(extensionPath);
  const requirements = await readRequirementsDocs(workspaceRoot);
  const bestPractices = await readBestPracticesDocs(workspaceRoot);

  return { agents, knowledgeRules, requirements, bestPractices };
}

/** Compose the review prompt from gathered data */
export function composeReviewPrompt(
  agents: AgentSnapshot[],
  knowledgeRules: Array<{ filename: string; content: string }>,
  requirements: {
    spec: string;
    architecture: string;
    docs: Array<{ filename: string; content: string }>;
  },
  bestPractices: Array<{ filename: string; content: string }>,
  reviewScope: string,
): string {
  const sections: string[] = [];

  // --- Role & task ---
  sections.push(
    "# CPS Solution Review",
    "",
    "You are an expert Copilot Studio solution reviewer. Your task is to review the CPS agent solution below against the best practice rules provided, then produce a structured review report.",
    "",
  );

  // --- Requirements context ---
  if (requirements.spec) {
    sections.push("## Spec", "", requirements.spec, "");
  }
  if (requirements.architecture) {
    sections.push("## Architecture", "", requirements.architecture, "");
  }
  if (requirements.docs.length > 0) {
    sections.push("## Requirements Docs", "");
    for (const doc of requirements.docs) {
      sections.push(`### ${doc.filename}`, "", doc.content, "");
    }
  }

  // --- Agent YAML (the solution being reviewed) ---
  sections.push("## Solution Under Review", "");

  for (const agent of agents) {
    sections.push(`### Agent: ${agent.name}`, "");

    sections.push("#### settings", "```yaml", agent.settings, "```", "");

    if (agent.topics.length > 0) {
      sections.push("#### topics", "");
      for (const t of agent.topics) {
        sections.push(`**${t.filename}**`, "```yaml", t.content, "```", "");
      }
    }

    if (agent.actions.length > 0) {
      sections.push("#### actions", "");
      for (const a of agent.actions) {
        sections.push(`**${a.filename}**`, "```yaml", a.content, "```", "");
      }
    }

    if (agent.knowledge.length > 0) {
      sections.push("#### knowledge", "");
      for (const k of agent.knowledge) {
        const fence = k.filename.endsWith(".md") ? "markdown" : "yaml";
        sections.push(`**${k.filename}**`, "```" + fence, k.content, "```", "");
      }
    }
  }

  // --- Best practice rules ---
  sections.push("## Best Practice Rules", "");
  sections.push(
    "Review the solution against ALL of the following CPS best practice rules. These are the authoritative reference — cite specific rules when you find issues.",
    "",
  );

  for (const rule of knowledgeRules) {
    const title = rule.filename.replace(/\.md$/, "").replace(/-/g, " ");
    sections.push(`### ${title}`, "", rule.content, "");
  }

  // --- User-provided best practices ---
  if (bestPractices.length > 0) {
    sections.push("## Additional Best Practices (User-Provided)", "");
    sections.push(
      "The following additional best practice documents were provided by the developer in the `docs/bestpractices/` folder. These are domain-specific or organisation-specific rules that supplement the core CPS best practices above. Review the solution against these as well.",
      "",
    );
    for (const bp of bestPractices) {
      const title = bp.filename.replace(/\.md$/, "").replace(/-/g, " ");
      sections.push(`### ${title}`, "", bp.content, "");
    }
  }

  // --- Scope-specific instructions ---
  if (reviewScope === "full") {
    sections.push(
      "## Review Instructions",
      "",
      "Perform a comprehensive review of the entire solution. Check every agent, topic, action, and knowledge configuration against the best practice rules above.",
      "",
    );
  } else if (reviewScope === "prompts") {
    sections.push(
      "## Review Instructions",
      "",
      "Focus your review on agent instructions and topic-level prompts. Check instruction quality, length, structure, accumulation issues, and prompt engineering patterns.",
      "",
    );
  } else if (reviewScope === "descriptions") {
    sections.push(
      "## Review Instructions",
      "",
      "Focus your review on descriptions: topic trigger descriptions, tool/action descriptions, child agent descriptions, and knowledge source descriptions. Check routing quality and orchestrator guidance.",
      "",
    );
  } else if (reviewScope === "architecture") {
    sections.push(
      "## Review Instructions",
      "",
      "Focus your review on the multi-agent architecture: agent decomposition, routing patterns, output preservation, specialist design, and whether the agent split is appropriate.",
      "",
    );
  }

  // --- Output format ---
  sections.push(
    "## Required Output Format",
    "",
    "Write the review as a structured markdown report with these sections:",
    "",
    "### 1. Executive Summary",
    "2-3 sentence overview of overall solution quality and the most important finding.",
    "",
    "### 2. What the Solution Does Well",
    "List specific things the solution gets right, citing the relevant best practice. Be genuine — only include things that are actually well done. For each item:",
    "- **What**: What the solution does",
    "- **Why it matters**: Which best practice it follows and why this is important",
    "",
    "### 3. Findings (Prioritised)",
    "List every issue found, ordered by impact (Critical → High → Medium → Low).",
    "",
    "For each finding use this structure:",
    "- **Priority**: Critical / High / Medium / Low",
    "- **Category**: (e.g., Prompt Engineering, Descriptions, Architecture, Constraints, Tool Safety)",
    "- **Finding**: What the issue is",
    "- **Rule**: Which specific best practice rule it violates (quote or cite from the rules above)",
    "- **Where**: Which agent/file/line is affected",
    "- **Suggested fix**: Concrete, specific change — not vague advice. Show before/after where possible",
    "",
    "Priority definitions:",
    "- **Critical**: Will cause broken behaviour, wrong routing, or tool failures",
    "- **High**: Significantly degrades quality, causes unreliable behaviour",
    "- **Medium**: Misses a best practice that would improve quality or maintainability",
    "- **Low**: Minor improvement, stylistic, or future-proofing",
    "",
    "### 4. Architecture Assessment",
    "If this is a multi-agent solution, assess:",
    "- Is the agent decomposition appropriate?",
    "- Are there agents that should be merged or split further?",
    "- Is output preservation handled correctly between agents?",
    "- Are there missing patterns (evaluator, reporter, versioning)?",
    "",
    "### 5. Quick Wins",
    "Top 3-5 changes that would have the highest impact for the least effort.",
    "",
    "---",
    "",
    "Be specific and actionable. Reference exact file names and quote actual text from the YAML when pointing out issues. Do not give generic advice — every finding must reference something concrete in the solution.",
  );

  return sections.join("\n");
}
