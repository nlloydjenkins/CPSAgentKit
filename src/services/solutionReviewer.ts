import * as fs from "fs/promises";
import * as path from "path";
import {
  readYamlFiles,
  readMarkdownFiles,
  findCpsAgentFolders,
} from "./fileUtils.js";
import { CURRENT_VERSION } from "./config.js";

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

/**
 * Check whether a markdown string is just the empty template
 * (headings, HTML comments, placeholder dashes, empty tables, checkboxes)
 * with no real authored content.
 */
export function isTemplateOnly(md: string): boolean {
  const lines = md.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") { continue; }              // blank line
    if (line.startsWith("#")) { continue; }      // heading
    if (line.startsWith("<!--")) { continue; }   // HTML comment
    if (/^[\|\-\s:]+$/.test(line)) { continue; } // table separator row
    if (/^\|(\s*\|)+$/.test(line)) { continue; } // empty table data row (any column count)
    if (/^\|[\w\s|]+\|$/.test(line)) { continue; } // table header row (words only)
    if (line === "-") { continue; }              // placeholder list item
    if (/^-\s+\*\*[^*]+:\*\*/.test(line)) { continue; } // bold-label list item
    if (/^-\s*\[[ x]\]/.test(line)) { continue; } // checkbox
    if (/^\d+\.$/.test(line)) { continue; }      // placeholder ordered list item
    // If we get here, this line has real content
    return false;
  }
  return true;
}

/** Strip noisy XML elements from settings content (e.g. iconbase64, synchronizationstatus) */
function stripSettingsNoise(settings: string): string {
  // Remove <iconbase64>...</iconbase64> (can be multiline)
  let result = settings.replace(/<iconbase64>[\s\S]*?<\/iconbase64>/g, "");
  // Remove <synchronizationstatus>...</synchronizationstatus> (can be multiline)
  result = result.replace(/<synchronizationstatus>[\s\S]*?<\/synchronizationstatus>/g, "");
  // Clean up resulting blank lines
  result = result.replace(/\n{3,}/g, "\n\n");
  return result;
}

/** Detect the likely format of file content for fenced code blocks */
function detectFenceLanguage(content: string): string {
  const trimmed = content.trimStart();
  if (trimmed.startsWith("<") || trimmed.startsWith("<?xml")) {
    return "xml";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json";
  }
  return "yaml";
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
  const now = new Date();
  const timestamp = now.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  sections.push(
    "# CPS Solution Review",
    "",
    `**CPSAgentKit version**: ${CURRENT_VERSION}`,
    `**Generated**: ${timestamp}`,
    `**Review scope**: ${reviewScope}`,
    "",
    "You are an expert Copilot Studio solution reviewer. Your task is to review the CPS agent solution below against the best practice rules provided, then produce a structured review report.",
    "",
    "The report you generate MUST begin with this **Assessment Metadata** block as the very first thing in the output, before any other content:",
    "",
    "```",
    `CPSAgentKit version: ${CURRENT_VERSION}`,
    `Generated: ${timestamp}`,
    `Review scope: ${reviewScope}`,
    "Model: [replace with your actual model name and version, e.g. GPT-4o 2025-03-26 or Claude Sonnet 4]",
    "```",
    "",
  );

  // --- Requirements context (skip if just the empty template) ---
  const specBlank = !requirements.spec || isTemplateOnly(requirements.spec);
  const archBlank = !requirements.architecture || isTemplateOnly(requirements.architecture);

  if (!specBlank) {
    sections.push("## Spec", "", requirements.spec, "");
  }
  if (!archBlank) {
    sections.push("## Architecture", "", requirements.architecture, "");
  }
  if (requirements.docs.length > 0) {
    sections.push("## Requirements Docs", "");
    for (const doc of requirements.docs) {
      sections.push(`### ${doc.filename}`, "", doc.content, "");
    }
  }

  // --- Architecture diagrams note ---
  sections.push(
    "## Architecture Diagrams",
    "",
    "If architecture diagrams, network topology diagrams, or design images have been pasted alongside this prompt, analyse them carefully. They are essential for understanding:",
    "- Network boundaries and private endpoint topology (determines whether HttpRequestAction is viable or whether gateway routing / custom connectors are required)",
    "- Authentication flows between components",
    "- Integration boundaries and cross-system handoffs",
    "- Agent routing and conversation flow",
    "",
    "Reference specific diagram observations in your findings where relevant.",
    "",
  );

  // --- Agent data (the solution being reviewed) ---
  sections.push("## Solution Under Review", "");

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

  // --- Supporting docs analysis ---
  sections.push(
    "## Pre-Analysis: Supporting Document Scan",
    "",
    "Before writing the report, scan all Requirements Docs, Spec, and solution context for:",
    "- Active platform constraints (execution limits, throttling, exemptions)",
    "- Deadlines (exemption windows, compliance dates, migration timelines)",
    "- Escalation status (CIO involvement, Microsoft case numbers, support tickets)",
    "- Business urgency signals (production outages, user impact, SLA breaches)",
    "",
    "Use these to determine whether the report needs a Remediation Plan section and whether the Executive Summary should lead with urgency context.",
    "",
  );

  // --- Output format ---
  sections.push(
    "## Required Output Format",
    "",
    "Write the review as a structured markdown report with these sections:",
    "",
    "### Inference Discipline",
    "",
    "When describing what the solution does, use language that matches your actual confidence level:",
    "",
    "- **Confirmed**: You can point to a specific YAML file, XML element, environment variable, or topic configuration that directly shows this. Use definitive language: 'The solution uses...', 'Topic X implements...', 'The environment variable is set to...'",
    "- **Inferred from structure**: The artifact structure suggests this but you cannot point to a single definitive element. Use qualified language: 'The topic structure suggests...', 'Based on the flow pattern, this likely...', 'The presence of X indicates that Y is probably...'",
    "- **Expected from context**: Customer documents or architecture diagrams describe this but the solution artifacts do not confirm it. Use attribution language: 'The architecture document states...', 'According to the customer's diagram...', 'The escalation notice references...'",
    "- **Not verifiable**: You cannot confirm this from any available source. Do not state it as fact. Either omit it or explicitly flag it: 'This could not be verified in the available artifacts.'",
    "",
    "Do NOT describe controls, integrations, or patterns as implemented unless you can cite the specific artifact. When a customer-supplied diagram shows a component (e.g., APIM, WAF, managed identity) but the solution YAML does not reference it, say 'shown in the architecture diagram' not 'the solution uses'.",
    "",
    "### Evidence Note",
    "> This assessment combines four kinds of evidence: published Copilot Studio platform guidance, repeated real-world platform behaviour observed in practice, direct observations from this solution's YAML, and context stated in the customer's own documents. Not every finding is equally documented by Microsoft, but each is included because it is relevant to production behaviour or maintainability. The **Evidence** field on each finding indicates which type applies.",
    "",
    "### 1. Executive Summary",
    "If the pre-analysis identified an active platform constraint, deadline, or escalation, the Executive Summary must open with that context: state the constraint, the deadline, and the business impact before anything else. Include a direct pointer to the Remediation Plan (Section 2). Then give a 2-3 sentence overview of overall solution quality and the most important finding.",
    "",
    "If no active constraint was found, write a standard 2-3 sentence overview of overall solution quality and the most important finding.",
    "",
    "### 2. Remediation Plan (conditional)",
    "",
    "Include this section only if the pre-analysis identified an active platform constraint, deadline, or escalation. If none was found, omit this section entirely and do not include a placeholder.",
    "",
    "When included:",
    "- State the constraint clearly at the top",
    "- Map critical and high-priority findings to concrete remediation actions",
    "- Sequence actions by real-world dependency, not just priority. If Action B depends on Action A being in place, Action A must come first regardless of its individual priority ranking.",
    "- Do NOT include timeframes, durations, week numbers, day ranges, or time estimates in phase titles or descriptions. The phases represent priority order only, not a schedule.",
    "- For each phase include:",
    "  - Phase number",
    "  - Action: specific change to make",
    "  - Addresses: which finding(s) this resolves (reference by finding ID)",
    "  - Impact: estimated improvement to the constraint being addressed",
    "  - Effort: Low (configuration change) / Medium (flow or code rework) / High (architectural redesign)",
    "  - Effort type: Configuration change / Flow rework / Architectural redesign",
    "  - Risk: Low / Medium / High",
    "  - Dependencies: what must be completed first (reference prior phase numbers)",
    "- After listing all phases, include a brief dependency narrative explaining the sequencing rationale in 2-3 sentences",
    "- End with a summary table of all phases",
    "",
    "### 3. What the Solution Does Well",
    "List specific things the solution gets right, citing the relevant best practice. Be genuine — only include things that are actually well done. For each item:",
    "- **What**: What the solution does",
    "- **Why it matters**: Which best practice it follows and why this is important",
    "",
    "### 4. Findings (Prioritised)",
    "List every issue found, ordered by impact (Critical → High → Medium → Low).",
    "",
    "For each finding use this structure:",
    "- **Priority**: Critical / High / Medium / Low",
    "- **Evidence**: Documented platform behaviour / Observed platform behaviour / Solution-specific observation / Customer-stated context",
    "- **Source**: Platform limitation / Solution implementation / Integration pattern",
    "- **Impact Horizon**: Immediate operational / Near-term stabilisation / Medium-term improvement / Strategic redesign",
    "- **Category**: (e.g., Prompt Engineering, Descriptions, Architecture, Constraints, Tool Safety)",
    "- **Finding**: What the issue is",
    "- **Rule**: Which specific best practice rule it violates (quote or cite from the rules above)",
    "- **Where**: Which agent/file/line is affected",
    "- **Suggested fix**: Concrete, specific change — not vague advice. Show before/after where possible",
    "- **Diagram** (optional): Where an architectural or flow issue is easier to understand visually, include a Mermaid diagram that highlights the problem. Use diagrams selectively — only when they genuinely clarify the issue (e.g., circular dependencies, missing error paths, data-flow bottlenecks, network boundary violations). Keep diagrams small and focused on the specific problem, not full solution maps.",
    "",
    "Evidence definitions:",
    "- **Documented platform behaviour**: Maps to published Microsoft Learn documentation or explicit platform limitations",
    "- **Observed platform behaviour**: Field-tested behaviour from real CPS deployments — edge cases, planner quirks, silent failures that official docs understate or omit. These are not less important than documented findings; they are often the most production-relevant",
    "- **Solution-specific observation**: Observation about this specific solution's YAML configuration — not a general platform claim",
    "- **Customer-stated context**: Information provided in the customer's own documents — escalation notices, exemption letters, issue descriptions, meeting notes, or architecture explanations. Not independently verified in the solution artifacts",
    "",
    "Source definitions:",
    "- **Platform limitation**: A constraint or behaviour inherent to Copilot Studio that the customer cannot change — only work around or design for",
    "- **Solution implementation**: A decision made in this solution's CPS configuration (topics, prompts, knowledge, actions) that could be changed by the customer",
    "- **Integration pattern**: An issue in the surrounding Azure, Power Automate, Dataverse, identity, or connector layer — outside CPS itself but affecting the solution",
    "",
    "When a finding's root cause spans multiple sources (e.g., a CPS topic triggers excessive Power Automate calls), tag the primary source and note the secondary in the finding description.",
    "",
    "Impact Horizon definitions:",
    "- **Immediate operational**: Actively causing or contributing to a production issue now. Must be addressed within the current escalation or exemption window",
    "- **Near-term stabilisation**: Not breaking production today but creates significant risk of recurrence or degradation. Address within weeks",
    "- **Medium-term improvement**: Reduces technical debt, improves maintainability, or prevents future issues. Address within a normal development cycle",
    "- **Strategic redesign**: Requires architectural rethinking. Important for long-term health but should not block immediate stabilisation work",
    "",
    "Impact Horizon is independent of Priority. A Critical finding is usually Immediate operational, but a High finding could be Near-term stabilisation or Medium-term improvement depending on whether it is actively affecting production.",
    "",
    "Priority definitions:",
    "- **Critical**: Deterministic failure or near-certain broken behaviour — wrong routing, tool failures, or blocked functionality",
    "- **High**: Creates significant production risk — unreliable behaviour, degraded quality, or silent failures likely under real-world conditions",
    "- **Medium**: Misses a best practice that would improve quality or maintainability",
    "- **Low**: Minor improvement, stylistic, or future-proofing",
    "",
    "When a finding is a governance or process improvement (version stamping, test cycles, changelog practices) rather than a platform constraint violation, frame it as a governance recommendation. Use language like 'recommended practice' or 'governance improvement' rather than 'violates' or 'breaks'.",
    "",
    "### 5. Architecture Assessment",
    "If this is a multi-agent solution, assess:",
    "- Is the agent decomposition appropriate?",
    "- Are there agents that should be merged or split further?",
    "- Is output preservation handled correctly between agents?",
    "- Are there missing patterns (evaluator, reporter, versioning)?",
    "",
    "When referencing architecture components that appear in customer-supplied diagrams or documents but are not visible in the CPS solution artifacts (e.g., API Management, identity providers, network topology, external services), clearly attribute the source: 'Per the customer's architecture diagram, the solution sits behind APIM' rather than 'The solution uses APIM for routing.'",
    "",
    "### 6. Quick Wins",
    "Top 3-5 changes that would have the highest impact for the least effort.",
    "",
    "---",
    "",
    "Be specific and actionable. Reference exact file names and quote actual text from the YAML when pointing out issues. Do not give generic advice — every finding must reference something concrete in the solution.",
    "",
    "---",
    "",
    "**Save this report to `Reports/assessment.md` (create the `Reports` folder if it does not exist). Any previous assessment.md has already been archived automatically.**",
    "",
    "### 7. Generate Spec and Architecture (if missing)",
    "",
    "If the Spec and Architecture sections above are empty or missing, reverse-engineer them from the solution YAML you just reviewed:",
    "",
    "- Generate a `Requirements/spec.md` that captures what this agent is designed to do: its purpose, capabilities, boundaries, success criteria, and domain knowledge - inferred from the topics, tools, instructions, and conversation flows you observed.",
    "- Generate a `Requirements/architecture.md` that documents the as-built architecture: agent count and roles, routing logic, tools and connectors, knowledge sources, and manual portal steps - again inferred from the solution YAML.",
    "- These files give future assessment runs the intent context needed to compare intended vs actual behaviour.",
    "- Use the templates below as the structure for each file.",
    "",
    "If the Spec and Architecture were already provided above, skip this section entirely.",
  );

  // Include template outlines when spec/arch need generating
  if (specBlank || archBlank) {
    if (specBlank) {
      sections.push(
        "",
        "#### Spec template (for Requirements/spec.md)",
        "",
        "Use this structure:",
        "- Purpose (one paragraph)",
        "- What it should do (bullet list of capabilities)",
        "- What it should NOT do (explicit boundaries)",
        "- What success looks like (concrete examples)",
        "- Domain knowledge (data sources and systems)",
        "- Reference documents (table of source material)",
      );
    }
    if (archBlank) {
      sections.push(
        "",
        "#### Architecture template (for Requirements/architecture.md)",
        "",
        "Use this structure:",
        "- Overview (high-level description)",
        "- Agents (each agent's role, type, tools, knowledge, key instructions)",
        "- Routing Logic (how the parent selects agents)",
        "- Tools & Connectors (table: tool, owner agent, purpose, manual portal step required)",
        "- Knowledge Sources (table: source, agent, description, type)",
        "- Manual Portal Steps (ordered list)",
      );
    }
  }

  // --- Document manifest ---
  const docList: string[] = [];
  if (!specBlank) {
    docList.push("- Requirements/spec.md");
  }
  if (!archBlank) {
    docList.push("- Requirements/architecture.md");
  }
  for (const doc of requirements.docs) {
    docList.push(`- Requirements/docs/${doc.filename}`);
  }
  for (const bp of bestPractices) {
    docList.push(`- ${bp.filename}`);
  }

  sections.push(
    "",
    "---",
    "",
    "### Appendix: Documents Used in This Assessment",
    "",
    "The report you generate MUST end with this appendix. Copy the list below verbatim into the final section of your output:",
    "",
    ...docList,
  );

  return sections.join("\n");
}
