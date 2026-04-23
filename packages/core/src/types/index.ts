// Structured response shapes for parsing, assessment, and knowledge retrieval.
// These types are the stable contract shared by the VS Code extension and the
// MCP server. Keep this file free of runtime logic — it is purely declarative.

// ────────────────────────────────────────────────────────────
//  Agent snapshot — raw file contents grouped per agent
// ────────────────────────────────────────────────────────────

/** A single file belonging to a CPS agent, captured verbatim. */
export interface AgentFile {
  filename: string;
  content: string;
}

/**
 * Raw view of one cloned CPS agent's on-disk YAML/MD files.
 * Callers do their own YAML parsing on top of these strings.
 */
export interface AgentSnapshot {
  name: string;
  settings: string;
  agentConfig: string;
  connectionReferences: string;
  topics: AgentFile[];
  actions: AgentFile[];
  knowledge: AgentFile[];
  triggers?: AgentFile[];
}

// ────────────────────────────────────────────────────────────
//  AgentConfig — structured, parsed view of one agent
// ────────────────────────────────────────────────────────────

/**
 * A model tool reference found in an agent's actions folder or settings.
 * Covers connector tools, Power Automate flows, and MCP servers.
 */
export type AgentToolKind =
  | "connector"
  | "flow"
  | "mcp"
  | "prompt"
  | "unknown";

export interface AgentTool {
  /** File name the tool was defined in (e.g. `lookup_customer.mcs.yml`) */
  filename: string;
  /** `modelDisplayName` from the action YAML */
  displayName: string;
  /** `modelDescription` from the action YAML */
  description: string;
  kind: AgentToolKind;
  /** Connector family or MCP server name when available */
  connectorFamily?: string;
  /** Specific operation/action name on the connector */
  operationName?: string;
  /** Referenced flow id for Power Automate flows */
  flowId?: string;
}

export interface AgentTopic {
  filename: string;
  name: string;
  /** Short description / trigger description */
  description: string;
  /** True if the topic is system-generated (e.g. Start Conversation) */
  isSystem: boolean;
}

export type KnowledgeSourceType =
  | "sharepoint"
  | "public-website"
  | "enterprise-website"
  | "dataverse"
  | "documents"
  | "custom"
  | "unknown";

export interface AgentKnowledgeSource {
  filename: string;
  name: string;
  type: KnowledgeSourceType;
  description: string;
}

export interface AgentTrigger {
  filename: string;
  name: string;
  /** E.g. scheduled, event, webhook */
  kind: string;
  description: string;
}

export type AgentOrchestrationMode =
  | "generative"
  | "classic"
  | "unknown";

/**
 * Structured view of one agent, derived from parsing its YAML files.
 * This is the shape MCP tools (`cps_parse_agent`) return.
 */
export interface AgentConfig {
  name: string;
  displayName: string;
  /** Plain-text instructions / agent prompt */
  instructions: string;
  orchestration: AgentOrchestrationMode;
  /** `useModelKnowledge` setting — whether general LLM knowledge is allowed */
  useModelKnowledge: boolean;
  /** Whether web browsing is enabled */
  webBrowsing: boolean;
  topics: AgentTopic[];
  tools: AgentTool[];
  knowledgeSources: AgentKnowledgeSource[];
  triggers: AgentTrigger[];
  /** Agents this one can delegate to (connected / child agents) */
  connectedAgents: string[];
  /** Non-fatal issues encountered while parsing — surface these in UI */
  parseWarnings: string[];
}

// ────────────────────────────────────────────────────────────
//  Exported solution snapshot (from portal export, not clone)
// ────────────────────────────────────────────────────────────

export interface SolutionMetadata {
  uniqueName: string;
  displayName: string;
  version: string;
  publisher: string;
}

export interface SolutionBotComponent {
  schemaName: string;
  name: string;
  description: string;
  data: string;
}

export interface SolutionSnapshot {
  metadata: SolutionMetadata;
  bots: Array<{
    name: string;
    schemaName: string;
    botXml: string;
    configuration: string;
  }>;
  botComponents: SolutionBotComponent[];
  workflows: AgentFile[];
}

// ────────────────────────────────────────────────────────────
//  Assessment
// ────────────────────────────────────────────────────────────

export type AssessmentScope =
  | "full"
  | "prompts"
  | "descriptions"
  | "architecture";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type FindingCategory =
  | "instructions"
  | "tool-description"
  | "topic-description"
  | "routing"
  | "knowledge"
  | "orchestration"
  | "structure"
  | "security"
  | "naming"
  | "yaml-safety"
  | "other";

export interface FindingLocation {
  /** Agent folder / name the finding belongs to */
  agent?: string;
  /** File path relative to the agent folder, e.g. `topics/greeting.yaml` */
  file?: string;
  /** Human-readable pointer (line number, YAML path) */
  hint?: string;
}

export interface AssessmentFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  /** Short summary (≤ 120 chars) */
  title: string;
  /** Full issue description */
  issue: string;
  /** Concrete remediation step(s) */
  remediation: string;
  location: FindingLocation;
  /**
   * Slug of the knowledge rule that backs this finding.
   * Example: `"tool-descriptions"`, `"anti-patterns#general-knowledge-leak"`.
   */
  ruleRef?: string;
}

export interface AssessmentReport {
  /** ISO 8601 timestamp */
  generatedAt: string;
  scope: AssessmentScope;
  /** Names of the agents that were assessed */
  agents: string[];
  /** One-line executive summary */
  summary: string;
  findings: AssessmentFinding[];
  /**
   * Count of findings by severity for quick triage.
   * Callers can also derive this from `findings`.
   */
  counts: Record<FindingSeverity, number>;
}

// ────────────────────────────────────────────────────────────
//  Pre-build check
// ────────────────────────────────────────────────────────────

export interface PreBuildMissingItem {
  kind: "topic" | "tool" | "knowledge-source" | "trigger" | "agent";
  name: string;
  agent?: string;
  reason: string;
}

export interface ManualPortalStep {
  /** Short, imperative title (e.g. "Enable content moderation") */
  title: string;
  /** What the developer must do in the CPS portal */
  instruction: string;
  /** Why this must be done in the portal instead of YAML */
  reason: string;
}

export interface PreBuildCheck {
  generatedAt: string;
  missing: PreBuildMissingItem[];
  manualPortalSteps: ManualPortalStep[];
  /** Free-form flags/observations that don't fit the above */
  flags: string[];
}

// ────────────────────────────────────────────────────────────
//  Knowledge retrieval
// ────────────────────────────────────────────────────────────

export type KnowledgeCategory = "knowledge" | "bestpractices";

/**
 * Metadata-only view of a knowledge doc. Used by list/search tools.
 */
export interface KnowledgeTopic {
  slug: string;
  title: string;
  category: KnowledgeCategory;
  /** Relative path within the shipped resources (for debugging) */
  path: string;
}

/**
 * Full knowledge doc content. Used by the `cps_get_knowledge` /
 * `cps_get_best_practice` tools.
 */
export interface KnowledgeDocument extends KnowledgeTopic {
  content: string;
}

// ────────────────────────────────────────────────────────────
//  Tool-description validation
// ────────────────────────────────────────────────────────────

/** Severity scale for lint-style description issues (distinct from assessment findings). */
export type ToolDescriptionSeverity = "error" | "warning" | "info";

export interface ToolDescriptionIssue {
  severity: ToolDescriptionSeverity;
  message: string;
  suggestion?: string;
}

export interface ToolDescriptionValidation {
  /** Overall pass/fail — true if no error-severity issues */
  ok: boolean;
  length: number;
  wordCount: number;
  issues: ToolDescriptionIssue[];
  /** Concrete suggestions the caller can surface to the author */
  suggestions: string[];
}

// ────────────────────────────────────────────────────────────
//  Spec / architecture drafts (for reverse-engineering)
// ────────────────────────────────────────────────────────────

export interface AgentSpecDraft {
  purpose: string;
  shouldDo: string[];
  shouldNotDo: string[];
  successCriteria: string[];
  users: string;
  channel: string;
  domainKnowledge: string[];
  constraints: string[];
}

export interface ArchitectureAgentSummary {
  name: string;
  role: "parent" | "child" | "connected" | "standalone";
  scope: string;
  tools: string[];
  knowledgeSources: string[];
}

export interface ArchitectureDraft {
  agents: ArchitectureAgentSummary[];
  routingLogic: string;
  knowledgeSources: Array<{ name: string; type: string; scope: string }>;
  manualPortalSteps: ManualPortalStep[];
  generalKnowledgeStance: "enabled" | "disabled" | "mixed";
  appliedConstraints: string[];
}
