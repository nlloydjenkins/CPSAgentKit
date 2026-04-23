/**
 * Canonical Build State checkbox labels used in architecture.md generation
 * and mapped to guidance prompts in the build command.
 *
 * Both createArchitecture.ts and build.ts import from here to prevent drift.
 */

// --- Pre-checked labels (informational, not mapped to guidance) ---
export const LABEL_SPEC_COMPLETE = "Spec complete";
export const LABEL_ARCHITECTURE_APPROVED = "Architecture approved";

// --- Build State labels ---
export const LABEL_PLATFORM_CONSTRAINT_VALIDATION =
  "Platform constraint validation passed";
export const LABEL_AGENTS_CREATED = "Agents created in portal";
export const LABEL_TOOLS_CONFIGURED =
  "Tools/connectors configured (portal scaffold)";
export const LABEL_AUTONOMOUS_TRIGGERS = "Autonomous triggers configured";
export const LABEL_KNOWLEDGE_SOURCES = "Knowledge sources uploaded";
export const LABEL_DATAVERSE_TABLES = "Dataverse tables created";
export const LABEL_DATAVERSE_SAMPLE_DATA = "Dataverse sample data loaded";
export const LABEL_AGENT_INSTRUCTIONS = "Agent instructions generated";
export const LABEL_TOOL_DESCRIPTIONS = "Tool modelDescriptions generated";
export const LABEL_TOPIC_DESCRIPTIONS = "Topic descriptions and YAML generated";
export const LABEL_SYSTEM_TOPICS =
  "System topics customised (ConversationStart, Fallback, Escalation, OnError)";
export const LABEL_TRIGGER_DESCRIPTIONS = "Trigger descriptions updated";
export const LABEL_SETTINGS_COHERENCE = "Settings coherence validated";
export const LABEL_TOOLNAME_REFERENCES = "/ToolName references validated";
export const LABEL_CONTENT_MODERATION = "Content moderation set in portal";
export const LABEL_INITIAL_TESTING = "Initial testing complete";
export const LABEL_ITERATION_COMPLETE = "Iteration complete";
