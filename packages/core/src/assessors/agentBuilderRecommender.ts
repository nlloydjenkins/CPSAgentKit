/**
 * Builder-surface recommender — pure heuristic that maps a use-case signal
 * bag to one of three targets: Agent Builder (in M365 Copilot), Copilot
 * Studio (custom agent), or Declarative Agent authored in CPS.
 *
 * Decision rules live alongside this code in
 * `docs/knowledge/agent-builder.md` so makers and reviewers see the same
 * criteria the tool applies.
 */

export type BuilderRecommendation =
  | "agentBuilder"
  | "copilotStudio"
  | "declarativeAgentInCps";

export type KnowledgeSourceKind =
  | "sharepoint"
  | "onedrive"
  | "uploadedFiles"
  | "publicWeb"
  | "dataverse"
  | "graphConnector"
  | "customConnector"
  | "apiPlugin"
  | "mcp"
  | "other";

export type DeploymentSurface =
  | "m365Copilot"
  | "teamsBot"
  | "webChat"
  | "directLine"
  | "external";

export interface BuilderRecommendationInput {
  /** Where the agent will be used. */
  surfaces?: DeploymentSurface[];
  /** Knowledge sources the agent needs to ground on. */
  knowledgeSources?: KnowledgeSourceKind[];
  /** Custom tools / actions / connectors required. */
  needsCustomTools?: boolean;
  /** Custom connectors specifically (a subset of needsCustomTools). */
  needsCustomConnectors?: boolean;
  /** API plugins beyond what the Agent Builder picker offers. */
  needsApiPlugins?: boolean;
  /** Dataverse-backed state, prompt tools, or schema. */
  needsDataverse?: boolean;
  /** Power Automate flows wired as agent actions. */
  needsPowerAutomateActions?: boolean;
  /** MCP servers / sub-tools required. */
  needsMcp?: boolean;
  /** Event triggers, schedules, or long-running flows without a user in the loop. */
  needsAutonomousActions?: boolean;
  /** Orchestrator + specialists, or child-agent topology. */
  needsMultiAgent?: boolean;
  /** Solutions / environment promotion / source-control-backed pipelines. */
  needsAlm?: boolean;
  /** Complex deterministic topic orchestration (branching, variables, custom error handling). */
  needsComplexTopics?: boolean;
  /** Audience is exclusively M365 Copilot-licensed users. */
  audienceIsM365LicensedOnly?: boolean;
}

export interface BuilderRecommendationResult {
  recommendation: BuilderRecommendation;
  rationale: string[];
  signals: Required<
    Pick<
      BuilderRecommendationInput,
      | "needsCustomTools"
      | "needsCustomConnectors"
      | "needsApiPlugins"
      | "needsDataverse"
      | "needsPowerAutomateActions"
      | "needsMcp"
      | "needsAutonomousActions"
      | "needsMultiAgent"
      | "needsAlm"
      | "needsComplexTopics"
      | "audienceIsM365LicensedOnly"
    >
  > & {
    surfaces: DeploymentSurface[];
    knowledgeSources: KnowledgeSourceKind[];
    onlyM365Surface: boolean;
    onlyAgentBuilderKnowledge: boolean;
  };
}

const AGENT_BUILDER_KNOWLEDGE: ReadonlySet<KnowledgeSourceKind> = new Set([
  "sharepoint",
  "onedrive",
  "uploadedFiles",
  "publicWeb",
]);

/**
 * Decide whether a use case fits Agent Builder, Copilot Studio (custom agent),
 * or a Declarative Agent authored in CPS. Returns the recommendation plus the
 * rationale strings that drove it.
 */
export function recommendBuilder(
  input: BuilderRecommendationInput,
): BuilderRecommendationResult {
  const surfaces = input.surfaces ?? [];
  const knowledgeSources = input.knowledgeSources ?? [];

  const signals = {
    needsCustomTools: !!input.needsCustomTools,
    needsCustomConnectors: !!input.needsCustomConnectors,
    needsApiPlugins: !!input.needsApiPlugins,
    needsDataverse: !!input.needsDataverse,
    needsPowerAutomateActions: !!input.needsPowerAutomateActions,
    needsMcp: !!input.needsMcp,
    needsAutonomousActions: !!input.needsAutonomousActions,
    needsMultiAgent: !!input.needsMultiAgent,
    needsAlm: !!input.needsAlm,
    needsComplexTopics: !!input.needsComplexTopics,
    audienceIsM365LicensedOnly: !!input.audienceIsM365LicensedOnly,
    surfaces,
    knowledgeSources,
    onlyM365Surface:
      surfaces.length > 0 && surfaces.every((s) => s === "m365Copilot"),
    onlyAgentBuilderKnowledge:
      knowledgeSources.length === 0 ||
      knowledgeSources.every((k) => AGENT_BUILDER_KNOWLEDGE.has(k)),
  };

  const rationale: string[] = [];

  // ── Hard exits to Copilot Studio ──────────────────────────────────
  const cpsForcing: Array<[boolean, string]> = [
    [
      signals.needsCustomTools || signals.needsCustomConnectors,
      "Custom tools or connectors are required — Agent Builder does not author custom connectors.",
    ],
    [
      signals.needsAutonomousActions,
      "Autonomous / event-triggered actions are required — Agent Builder is reactive only.",
    ],
    [
      signals.needsMultiAgent,
      "Multi-agent topology (orchestrator + specialists / child agents) is required.",
    ],
    [
      signals.needsDataverse,
      "Dataverse-backed state, prompt tools, or schema is required.",
    ],
    [
      signals.needsPowerAutomateActions,
      "Power Automate flows wired as agent actions are required.",
    ],
    [signals.needsMcp, "MCP server / sub-tool integration is required."],
    [
      signals.needsComplexTopics,
      "Deterministic topic orchestration (branching, variables, custom error handling) is required.",
    ],
  ];

  const cpsHits = cpsForcing.filter(([hit]) => hit).map(([, why]) => why);

  const nonM365Surface = surfaces.some((s) => s !== "m365Copilot");
  if (nonM365Surface) {
    cpsHits.push(
      "Agent must run outside M365 Copilot (Teams bot / web chat / Direct Line / external channel).",
    );
  }

  if (cpsHits.length > 0) {
    rationale.push(...cpsHits);
    return { recommendation: "copilotStudio", rationale, signals };
  }

  // ── Declarative-agent-in-CPS middle path ──────────────────────────
  // Surface is M365 Copilot only, but the use case needs API plugins or ALM
  // beyond what Agent Builder gives you.
  if (
    signals.onlyM365Surface &&
    (signals.needsApiPlugins || signals.needsAlm)
  ) {
    if (signals.needsApiPlugins) {
      rationale.push(
        "Target surface is M365 Copilot, but API plugins are needed — author the declarative agent in Copilot Studio for richer plugin support and governance.",
      );
    }
    if (signals.needsAlm) {
      rationale.push(
        "ALM (solutions, environment promotion, source-controlled pipelines) is required — author the declarative agent in Copilot Studio so it ships as a CPS asset.",
      );
    }
    return { recommendation: "declarativeAgentInCps", rationale, signals };
  }

  // ── Agent Builder happy path ──────────────────────────────────────
  if (
    signals.onlyM365Surface &&
    signals.audienceIsM365LicensedOnly &&
    signals.onlyAgentBuilderKnowledge &&
    !signals.needsApiPlugins &&
    !signals.needsAlm
  ) {
    rationale.push(
      "Audience is M365 Copilot–licensed users on the M365 Copilot surface only.",
      knowledgeSources.length === 0
        ? "No knowledge sources specified — Agent Builder is sufficient for an instructions-only agent."
        : "Knowledge sources are limited to SharePoint / OneDrive / uploaded files / public web — all supported by Agent Builder.",
      "No custom tools, autonomous actions, multi-agent topology, Dataverse, Power Automate actions, MCP, or ALM requirements.",
    );
    return { recommendation: "agentBuilder", rationale, signals };
  }

  // ── Fallback ──────────────────────────────────────────────────────
  rationale.push(
    "Use case does not cleanly fit Agent Builder constraints (surface, audience, knowledge, or governance). Copilot Studio gives the broadest authoring surface and can also produce declarative agents when the runtime target is M365 Copilot.",
  );
  if (!signals.onlyM365Surface && surfaces.length === 0) {
    rationale.push("No deployment surface was specified.");
  }
  if (
    !signals.onlyAgentBuilderKnowledge &&
    knowledgeSources.some((k) => !AGENT_BUILDER_KNOWLEDGE.has(k))
  ) {
    rationale.push(
      `Knowledge source(s) outside Agent Builder's supported set: ${knowledgeSources
        .filter((k) => !AGENT_BUILDER_KNOWLEDGE.has(k))
        .join(", ")}.`,
    );
  }
  return { recommendation: "copilotStudio", rationale, signals };
}
