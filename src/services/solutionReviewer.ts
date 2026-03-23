import * as fs from "fs/promises";
import * as path from "path";
import {
  readYamlFiles,
  readMarkdownFiles,
  findCpsAgentFolders,
} from "./fileUtils.js";

/** A single CPS agent's files, grouped for review */
export interface AgentSnapshot {
  name: string;
  settings: string;
  agentConfig: string;
  connectionReferences: string;
  topics: Array<{ filename: string; content: string }>;
  actions: Array<{ filename: string; content: string }>;
  knowledge: Array<{ filename: string; content: string }>;
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

/** Read best practice documents from .cpsagentkit/bestpractices/ */
async function readBestPracticesDocs(
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

    if (agent.agentConfig) {
      sections.push(
        "#### agent config",
        "```yaml",
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
      "The following additional best practice documents supplement the core CPS best practices above. Review the solution against these as well.",
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
      "Also check for configuration coherence across files: verify that settings flags (isSemanticSearchEnabled, useModelKnowledge, webBrowsing, optInUseLatestModels, modelNameHint) are consistent with each other and with the agent's actual knowledge sources, tools, and capabilities. Flag any enabled feature that has no corresponding implementation, and any contradictory flag combinations.",
      "",
      "Check Dataverse connector usage: unfiltered full-table loads, missing $top/$filter, unchecked @odata.nextLink pagination, and duplicate queries across topics.",
      "",
    );
  } else if (reviewScope === "prompts") {
    sections.push(
      "## Review Instructions",
      "",
      "Focus your review on agent instructions and topic-level prompts. Check instruction quality, length, structure, accumulation issues, and prompt engineering patterns.",
      "",
      "Also check for configuration coherence: verify that settings flags (isSemanticSearchEnabled, useModelKnowledge, webBrowsing, optInUseLatestModels, modelNameHint) are consistent with each other and with the agent's actual knowledge sources, tools, and capabilities.",
      "",
    );
  } else if (reviewScope === "descriptions") {
    sections.push(
      "## Review Instructions",
      "",
      "Focus your review on descriptions: topic trigger descriptions, tool/action descriptions, child agent descriptions, and knowledge source descriptions. Check routing quality and orchestrator guidance.",
      "",
      "Also check for configuration coherence: verify that settings flags (isSemanticSearchEnabled, useModelKnowledge, webBrowsing, optInUseLatestModels, modelNameHint) are consistent with each other and with the agent's actual knowledge sources, tools, and capabilities.",
      "",
      "Check Dataverse connector usage: unfiltered full-table loads, missing $top/$filter, unchecked @odata.nextLink pagination, and duplicate queries across topics.",
      "",
    );
  } else if (reviewScope === "architecture") {
    sections.push(
      "## Review Instructions",
      "",
      "Focus your review on the multi-agent architecture: agent decomposition, routing patterns, output preservation, specialist design, and whether the agent split is appropriate.",
      "",
      "Also check for configuration coherence: verify that settings flags (isSemanticSearchEnabled, useModelKnowledge, webBrowsing, optInUseLatestModels, modelNameHint) are consistent with each other and with the agent's actual knowledge sources, tools, and capabilities.",
      "",
      "Check Dataverse connector usage: unfiltered full-table loads, missing $top/$filter, unchecked @odata.nextLink pagination, and duplicate queries across topics.",
      "",
    );
  }

  // --- Output format ---
  sections.push(
    "## Required Output Format",
    "",
    "Write the review as a structured markdown report with these sections:",
    "",
    "### Evidence Note",
    "> This assessment combines three kinds of evidence: published Copilot Studio platform guidance, repeated real-world platform behaviour observed in practice, and direct observations from this solution's YAML. Not every finding is equally documented by Microsoft, but each is included because it is relevant to production behaviour or maintainability. The **Evidence** field on each finding indicates which type applies.",
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
    "- **Evidence**: Documented platform behaviour / Observed platform behaviour / Solution-specific observation",
    "- **Category**: (e.g., Prompt Engineering, Descriptions, Architecture, Constraints, Tool Safety)",
    "- **Finding**: What the issue is",
    "- **Rule**: Which specific best practice rule it violates (quote or cite from the rules above)",
    "- **Where**: Which agent/file/line is affected",
    "- **Suggested fix**: Concrete, specific change — not vague advice. Show before/after where possible",
    "",
    "Evidence definitions:",
    "- **Documented platform behaviour**: Maps to published Microsoft Learn documentation or explicit platform limitations",
    "- **Observed platform behaviour**: Field-tested behaviour from real CPS deployments — edge cases, planner quirks, silent failures that official docs understate or omit. These are not less important than documented findings; they are often the most production-relevant",
    "- **Solution-specific observation**: Observation about this specific solution's YAML configuration — not a general platform claim",
    "",
    "Priority definitions:",
    "- **Critical**: Deterministic failure or near-certain broken behaviour — wrong routing, tool failures, or blocked functionality",
    "- **High**: Creates significant production risk — unreliable behaviour, degraded quality, or silent failures likely under real-world conditions",
    "- **Medium**: Misses a best practice that would improve quality or maintainability",
    "- **Low**: Minor improvement, stylistic, or future-proofing",
    "",
    "When a finding is a governance or process improvement (version stamping, test cycles, changelog practices) rather than a platform constraint violation, frame it as a governance recommendation. Use language like 'recommended practice' or 'governance improvement' rather than 'violates' or 'breaks'.",
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
    "",
    "---",
    "",
    "**Save this report to `assessment.md` in the workspace root.**",
  );

  return sections.join("\n");
}
