# Copilot Studio Cheat Sheet — Gotchas & Idiosyncrasies

Things that catch people out, behave unexpectedly, or aren't in the docs. For detailed guidance, see the referenced files.

---

## Orchestration

- Descriptions route, not triggers — bad descriptions = wrong routing. _(See prompt-engineering.md → Descriptions)_
- 10-turn memory — earlier context dropped; use variables for critical state. _(See constraints.md → Orchestration)_
- Switching to generative mode bypasses Conversational Boosting — custom data sources, Bing Custom Search all ignored.
- Multiple Topics Matched topic doesn't fire in generative mode.
- Auto-generated topic descriptions are adequate, never optimal — always review.
- Generative orchestration is English-only.

## Tools & Routing

- 128 tool hard limit, 25-30 practical limit — beyond 30, routing degrades. _(See constraints.md → Orchestration)_
- Tool names must be exact in instructions — use `/` syntax. _(See tool-descriptions.md)_
- Overlapping tool/agent names cause coin-flip routing — differentiate descriptions or restrict one to explicit invocation.
- `modelDescription` hard limit: 1,024 characters — silently truncated if exceeded. _(See constraints.md → Agent Instructions)_
- "Dynamically fill with AI" inputs without descriptions cause autonomous agents to prompt the user — always add a description with value source, format, and "never ask the user". _(See tool-descriptions.md → Connector Action Input Configuration)_
- One missing input description poisons the whole tool — orchestrator may prompt for ALL fields.
- System fields and primary keys on connector actions must be removed or set to custom values (e.g. `GUID()` for primary keys).
- Phantom field references in `modelDescription` (fields not in the input list) cause the orchestrator to prompt unexpectedly. _(See tool-descriptions.md → Phantom Field References)_
- Dynamic connectors (SendEmailV2, Dataverse Create/Update/List) can't be fully authored in YAML — wire bindings in portal, then Get Changes. _(See yaml-syntax.md → Dynamic Connector Actions)_

## Multi-Agent

- No circular dependencies, no multi-level chaining. _(See constraints.md → Multi-Agent)_
- Citations stripped in handoffs — by design, for security. No workaround.
- MCP tools on child agents are NOT invoked via parent orchestration. _(See multi-agent-patterns.md → MCP Tools Through Orchestration)_
- Ghost message / `explanation_of_tool_call`: leaks broadly as a platform behavior, not just in the narrow parent-no-topics case. Minimise by keeping instructions action-oriented. _(See multi-agent-patterns.md → The Ghost Message)_
- Child agent looping (post-Oct 2025): add explicit "end and return" instructions + track state variable. _(See multi-agent-patterns.md → Child Agent Looping)_
- Specialist agents leak into each other's domains — add explicit prohibitions. _(See multi-agent-patterns.md → Agent Boundary Enforcement)_
- Later pipeline stages compress earlier results — use labeled output blocks. _(See multi-agent-patterns.md → Output Preservation Pattern)_

## Knowledge & Retrieval

- Zero control over chunking or query type. _(See knowledge-sources.md → Chunking)_
- 7 MB silent limit without M365 Copilot license — no error, just no answers.
- Indexing delay: 5-30 minutes after enabling unstructured data.
- 25 knowledge source routing threshold — bad descriptions = sources never searched. _(See knowledge-sources.md → Knowledge Source Descriptions)_
- Can't force a specific knowledge article — AI chooses by query relevance.
- Classic ASPX pages, accordion nav, custom CSS, "&" in filenames all break retrieval. _(See constraints.md → SharePoint Specifics)_

## Instructions & Prompting

- Instructions are treated like code — debug by removing all, adding back one at a time. _(See prompt-engineering.md)_
- Negative instructions are unreliable — use dedicated topics instead. _(See anti-patterns.md → Prompt Anti-Patterns)_
- No temperature control at agent level — only in prompt actions.
- Follow-up questions require "Use general knowledge" enabled — silent failure otherwise.
- Content filtering is a black box — no logging, no diagnostics. Set `contentModeration: Low` for specialist domains. _(See constraints.md → Content Moderation)_
- 8,000-character instruction limit — quality may degrade before limit with dense instructions. _(See constraints.md → Agent Instructions)_
- Curly braces `{` `}` in instructions are evaluated as Power Fx — JSON examples will break. Use key=value notation instead. _(See constraints.md → Agent Instructions)_
- Instruction accumulation causes regressions — fix is structural, not textual. _(See prompt-engineering.md → The Instruction Accumulation Trap)_
- Prose format descriptions are unreliable — use literal templates + examples. _(See prompt-engineering.md → Output Format Enforcement)_
- Prompt tools provide code interpreter, temperature control, deterministic transforms. _(See prompt-engineering.md → Prompt Tools)_
- Autonomous pipeline `SystemError` from verbose child outputs — compact to machine-oriented format. Escalate to CPS workflow if persistent. _(See multi-agent-patterns.md → Autonomous Pipeline Output Compaction)_
- For summarisation-sensitive specialist pipelines (strict templates, structured data), prompt tools beat child agents — no orchestration summarisation layer. _(See multi-agent-patterns.md → Prompt Tools Over Child Agents and pipeline-patterns.md)_
- Format ownership lives at the production point — version stamps, fixed headings and literal templates go in the final-stage prompt, not in the orchestrator. _(See prompt-engineering.md → Output Format Ownership)_
- Template-line "MUST include X" reinforcements are unreliable — use literal templates with worked + negative examples in the body of the prompt. _(See prompt-engineering.md → Anti-Compression Directives)_
- Prefix tokens used for gating (`FAILED_CHECK:` etc) must be reserved for failures only — PASS lines must never use the prefix. _(See prompt-engineering.md → Prefix-Token Discipline)_
- Code interpreter is stdlib-only — no `bs4`, `pandas`, `nltk`. Revert to qualitative assessment or move the calculation to a flow. _(See constraints.md → Code Interpreter)_
- Prompt tool instruction text lives in Dataverse (`msdyn_aiconfiguration.msdyn_customconfiguration`), NOT in action YAML `modelDescription`. Edit via Dataverse MCP or a sync script. _(See prompt-sync.md)_
- Use echo `SendActivity` nodes between pipeline stages for debugging; remove before release. _(See troubleshooting.md → Pipeline Debugging with Echo Nodes)_

## Deployment & Channels

- Works in test pane ≠ works in Teams — different pipelines, auth contexts.
- Teams publishing doesn't auto-update for users.
- Declarative agents fail silently without M365 Copilot license. _(See declarative-agents.md)_
- Connector permissions behave differently in Teams.
- "Typing indicator then nothing" = cold-start throttling or PDF knowledge latency.

## ALM & Lifecycle

- Deleting knowledge sources is UI-only — ghost reference persists in API. _(See anti-patterns.md → Deployment Anti-Patterns)_
- No version diffing or rollback.
- Managed solutions + knowledge sources = vague SQL errors.
- Power Automate flows as declarative agent actions may not run reliably.
- Cloud flow 100-second timeout. _(See constraints.md → Flows and Connectors)_

## Miscellaneous

- Direct Line message size: 262,144 bytes (includes all context variables).
- Omnichannel ACS limit: 28 KB — variables silently dropped if exceeded.
- Connector payload: 5 MB public cloud, 450 KB GCC.
- Switching models can change agent behaviour — prompts that worked on one model may not work on another.
- Suggested prompts cache aggressively — may need cache clearing, new sessions, or channel re-add after publishing.
- Dataverse MCP Server requires **integer values** for choice columns — text labels cause `FormatException`. _(See constraints.md → Dataverse Choice/Option-Set Columns)_
- Office 365 Users "Get user profile (V2)" needs a UPN input — use "Get my profile (V2)" for the current user. _(See constraints.md → Connector Action Gotchas)_
- `conversationStarters` must use `title`/`text` object format — plain strings cause `MissingRequiredProperty` errors. _(See constraints.md → conversationStarters Format)_

## Dataverse Connectors

- Generic "Add a new row" connector binds to first table per conversation — second table fails with `UnresolvedDynamicType`. Use pre-bound actions per table. _(See constraints.md → Dataverse Connector — Dynamic Schema Binding)_
- Agent hallucinates column names if not given exhaustive column lists in modelDescription. _(See tool-descriptions.md → Pre-Bound Connector Descriptions)_
- `connectorRequestFailure` with no detail = likely invalid column name. _(See troubleshooting.md → connectorRequestFailure)_

## Multi-Stage Pipelines

- Generative orchestration stops after first child agent unless explicitly told not to. _(See anti-patterns.md → Pipeline Early Termination)_
- Per-stage "do NOT show to user" instructions required — one top-level instruction is insufficient. _(See prompt-engineering.md → Multi-Stage Pipeline Orchestration)_
- `AutomaticTaskInput` with empty/null value = prompts user, even in autonomous mode. N/A sentinel pattern required. _(See constraints.md → Agent Flow Input Declarations)_

## Tool References

- `/ToolName` referencing a tool that doesn't exist = silent skip, no error. _(See anti-patterns.md → Referencing Tools That Don't Exist)_
- Always cross-check `/ToolName` against actual `modelDisplayName` in action YAML before publishing. _(See tool-descriptions.md)_

## Flows

- Removing an action in PA designer replaces it with empty `For_each` and placeholder values. _(See anti-patterns.md → Portal Flow Editing Damage)_
- Power Automate owns workflow.json — CPS portal version is runtime source of truth. _(See constraints.md → PA Workflow.json)_

## YAML & Extension

- External CPS reference library: use `reference-library.md` and `reference-patterns.md` for curated patterns from `skills-for-copilot-studio`, but treat them as reference-only.
- **YAML kind mapping:** Top-level agent definitions use `kind: GptComponentMetadata`. Child agents use `kind: AgentDialog`. Topics use `kind: AdaptiveDialog`. Preserve these when editing — the platform expects them.
- **Model hints in agent YAML:** Exported agent YAML may contain `aISettings.model.modelNameHint`. Preserve it during edits, but don't invent new values unless the workspace already uses that pattern. The documented model/temperature configuration path is through prompt tools.
- **Prompt-level model/temperature:** Prompt tools let makers choose the model and temperature in the prompt editor. This is the supported configuration surface — use it for any capability that needs specific model settings.
- **ManualTaskInput `value` uses plain `Topic.xxx`** — no `=` prefix. Adding `=` causes `IdentifierNotRecognized` compile errors.
- **CPS extension "Apply Changes" can disappear** from Command Palette after rapid edits. Fix: Cmd+Shift+P → "Developer: Reload Window". _(See troubleshooting.md → CPS Extension Issues)_
- **Power Fx `Char()` is ASCII-only (1–255).** `UniChar()` may exist for Unicode but needs verification.

### Action/Tool YAML Structure — Safe vs Untouchable Fields

Tool/action YAML files have platform-generated structures. Most fields are untouchable. When editing, ONLY modify the fields listed as safe. Preserve everything else exactly.

**CRITICAL: Do NOT use `>-` or `|` block scalar syntax for `modelDescription`.** Block scalars break tools in CPS. Always use plain inline strings (quoted if the description contains special YAML characters like `:`).

**MCP Server tools** (`kind: TaskDialog` with `ModelContextProtocolMetadata`):

```yaml
mcs.metadata:
  componentName: <platform-generated> # UNTOUCHABLE
kind: TaskDialog # UNTOUCHABLE
modelDisplayName: <display name> # SAFE to edit
modelDescription: "<tool description for orchestrator routing>" # SAFE to edit — plain string, NOT >- block scalar
action:
  kind: InvokeExternalAgentTaskAction # UNTOUCHABLE
  connectionReference: <platform-generated> # UNTOUCHABLE
  connectionProperties: # UNTOUCHABLE
    mode: Invoker # UNTOUCHABLE
  operationDetails: # UNTOUCHABLE
    kind: ModelContextProtocolMetadata # UNTOUCHABLE
    operationId: InvokeMCP # UNTOUCHABLE
    knownTools: # UNTOUCHABLE
```

**Connector actions** (`kind: TaskDialog` with `InvokeConnectorTaskAction`):

```yaml
mcs.metadata:
  componentName: <platform-generated> # UNTOUCHABLE
kind: TaskDialog # UNTOUCHABLE
inputs: # UNTOUCHABLE (platform-generated)
  - kind: ManualTaskInput # UNTOUCHABLE
    propertyName: <param> # UNTOUCHABLE
    value: <value> # UNTOUCHABLE
modelDisplayName: <display name> # SAFE to edit
modelDescription: "<tool description for orchestrator routing>" # SAFE to edit — plain string, NOT >- block scalar
outputs: # UNTOUCHABLE (platform-generated)
  - propertyName: <field> # UNTOUCHABLE
    name: <name> # UNTOUCHABLE
    description: <desc> # UNTOUCHABLE
action:
  kind: InvokeConnectorTaskAction # UNTOUCHABLE
  connectionReference: <platform-generated> # UNTOUCHABLE
  connectionProperties: # UNTOUCHABLE
    mode: Invoker # UNTOUCHABLE
  operationId: <platform-generated> # UNTOUCHABLE
  dynamicOutputSchema: ... # UNTOUCHABLE
outputMode: All # UNTOUCHABLE
```

**Power Automate flows** (`kind: TaskDialog` with `InvokeFlowTaskAction`):

```yaml
mcs.metadata:
  componentName: <platform-generated> # UNTOUCHABLE
kind: TaskDialog # UNTOUCHABLE
modelDisplayName: <display name> # SAFE to edit — add if missing
modelDescription: "<tool description for orchestrator routing>" # SAFE to edit — add if missing, plain string, NOT >- block scalar
action:
  kind: InvokeFlowTaskAction # UNTOUCHABLE
  flowId: <platform-generated> # UNTOUCHABLE
outputMode: All # UNTOUCHABLE
```

Note: Flows may not have `modelDisplayName` or `modelDescription` by default. If absent, **add them** — the orchestrator needs a description to route correctly. The default `componentName: Untitled` is not sufficient for routing.

**Rule:** When editing any tool/action YAML, only modify `modelDisplayName` and `modelDescription`. Add them if they are missing — every tool needs a descriptive name and description for the orchestrator to route correctly. Everything else — `mcs.metadata`, `kind`, `inputs`, `outputs`, `outputMode`, and the entire `action` block (including `connectionReference`, `connectionProperties`, `operationId`, `operationDetails`, `dynamicOutputSchema`, `flowId`) — is platform-generated and must not be changed.

### Knowledge Source YAML Structure

**Dataverse table** (`kind: KnowledgeSourceConfiguration`):

```yaml
mcs.metadata:
  componentName: <table name> # UNTOUCHABLE
  description: >- # SAFE to edit — improve for routing
    <description used by orchestrator for source selection>
kind: KnowledgeSourceConfiguration # UNTOUCHABLE
source:
  kind: DataverseStructuredSearchSource # UNTOUCHABLE
  skillConfiguration: <platform-generated> # UNTOUCHABLE
```

The `description` in `mcs.metadata` is critical at scale — beyond 25 knowledge sources, the orchestrator uses an internal GPT to filter which sources to search based on descriptions. The default auto-generated description ("This knowledge source answers questions found in the following Dataverse items: Account") is functional but should be rewritten to be specific about what domain/topic the table covers and what it does NOT cover.

---

_Last updated: March 2026. The platform changes fast — validate against your environment._
