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

## Multi-Agent

- No circular dependencies, no multi-level chaining. _(See constraints.md → Multi-Agent)_
- Citations stripped in handoffs — by design, for security. No workaround.
- MCP tools on child agents are NOT invoked via parent orchestration. _(See multi-agent-patterns.md → MCP Tools Through Orchestration)_
- Ghost message: parent with no topics + "Don't respond" after child = unsolicited `explanation_of_tool_call` message.
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
- Instruction accumulation causes regressions — fix is structural, not textual. _(See prompt-engineering.md → The Instruction Accumulation Trap)_
- Prose format descriptions are unreliable — use literal templates + examples. _(See prompt-engineering.md → Output Format Enforcement)_
- Prompt tools provide code interpreter, temperature control, deterministic transforms. _(See prompt-engineering.md → Prompt Tools)_

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

## YAML & Extension

- **YAML kind mapping:** Top-level agent definitions use `kind: GptComponentMetadata`. Child agents use `kind: AgentDialog`. Topics use `kind: AdaptiveDialog`. Preserve these when editing — the platform expects them.
- **Model hints in agent YAML:** Exported agent YAML may contain `aISettings.model.modelNameHint`. Preserve it during edits, but don't invent new values unless the workspace already uses that pattern. The documented model/temperature configuration path is through prompt tools.
- **Prompt-level model/temperature:** Prompt tools let makers choose the model and temperature in the prompt editor. This is the supported configuration surface — use it for any capability that needs specific model settings.

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
