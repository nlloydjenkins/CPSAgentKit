# Copilot Studio Cheat Sheet — Gotchas & Idiosyncrasies

Things that catch people out, behave unexpectedly, or aren't in the docs.

---

## Orchestration

- **Descriptions route, not triggers.** In generative mode, the orchestrator picks tools/topics based on their description, not trigger phrases. Bad descriptions = wrong routing. This is the #1 cause of "it calls the wrong thing."
- **10-turn memory.** The orchestrator only sees the last 10 conversation turns. Turn 15? It's forgotten turn 1. Critical state must live in variables, not conversation history.
- **Switching to generative mode silently breaks things.** The Conversational Boosting system topic is bypassed. Custom data sources, Bing Custom Search, and any modifications you made to it — all ignored.
- **The Multiple Topics Matched topic doesn't fire** in generative mode. The planner handles disambiguation itself. You lose "did you mean X or Y?" prompts.
- **Auto-generated topic descriptions** (from trigger phrases when switching modes) are often adequate, never optimal. Always review them.
- **Generative orchestration is English-only.**

## Tools & Routing

- **128 tool hard limit, 25-30 practical limit.** Beyond 30 tools, the orchestrator starts ignoring instructions, misrouting, and making unnecessary calls.
- **Tool names must be exact in instructions.** If your instruction says "Create Order" but the tool is named "Create Purchase Order," it won't match reliably. Use the `/` syntax.
- **Overlapping tool/agent names cause chaos.** "Check account balance" tool + "Get account balance" agent = coin flip routing. Restrict one to explicit invocation only (clear "Allow agent to decide dynamically").

## Multi-Agent

- **No circular dependencies.** Agent A → Agent B → Agent A is blocked at the platform level.
- **No multi-level chaining.** Parent → child is fine. Parent → child → child's child is not. Flatten or use child agents within connected agents.
- **Citations get stripped in handoffs.** Parent receives a summarised version of the child's response. SharePoint links, reference citations — gone. By design, for security. No workaround.
- **MCP tools fail through orchestration.** Child agent's MCP server tools are not invoked when called via parent orchestration. The child fires, the MCP calls don't. Major limitation, not clearly documented.
- **The ghost message.** Parent with no topics/knowledge of its own + "Don't respond" after child = platform sends an unsolicited `explanation_of_tool_call` message anyway.
- **Child agent looping.** Post-Oct 2025: child agents with tools (especially Send Email V2) fail to signal completion. Parent re-triggers. Infinite loop. Add explicit "end and return" instructions + track state with a variable.

## Knowledge & Retrieval

- **Zero control over chunking.** Documents uploaded to CPS are chunked by Dataverse with undocumented defaults. No control over chunk size, overlap, or strategy.
- **No control over query type.** Can't choose keyword vs vector vs hybrid search. Can't add filters. Can't rerank.
- **7 MB silent limit.** Without an M365 Copilot license in the tenant, SharePoint files over 7 MB are silently ignored. No error, just no answers.
- **Indexing delay.** 5-30 minutes after enabling unstructured data. During this window, retrieval is unreliable or non-functional.
- **25 knowledge source routing threshold.** Beyond 25 sources, the orchestrator uses an internal GPT to filter which to search — based on their descriptions. Bad descriptions = sources never get searched.
- **You can't force a specific knowledge article.** Instructions like "always use document X" are unreliable. The AI chooses based on query relevance.
- **Classic ASPX SharePoint pages don't work.** Only modern pages. Also: accordion nav menus, custom CSS, and "&" in filenames all break things.
- **SharePoint lists with >12 lookup columns** in the default view aren't supported as knowledge sources.

## Instructions & Prompting

- **Instructions are treated like code.** Wrong instructions break your agent. Debug by removing all, adding back one at a time, testing between each.
- **Negative instructions are unreliable.** "Never mention competitors" will be violated. Use a dedicated topic with a manual response instead.
- **No temperature control at agent level.** Only available in prompt actions. The main agent uses platform defaults.
- **Follow-up questions require general knowledge enabled.** Disable "Use general knowledge" and the agent can't ask clarifying questions — they're considered "ungrounded" and suppressed. Silent failure.
- **Content filtering is a black box.** When triggered: no logging, no reason code, no diagnostic info. Debugging is impossible. You can try rewording instructions to indicate the behaviour is expected.
- **8,000-character instruction limit.** This is the documented hard limit. Quality and routing may degrade before hitting it with dense or complex instructions — decompose into child agents or prompt tools rather than packing one instruction block.

## Deployment & Channels

- **Works in test pane ≠ works in Teams.** Different pipelines, different auth contexts, different requirements. Test pane uses maker credentials; production uses end-user credentials.
- **Teams publishing doesn't auto-update for users.** Different users run different agent versions simultaneously.
- **Declarative agents fail silently without M365 Copilot license.** Agent provisions fine, but SharePoint grounding fails at runtime with a generic "Sorry, I wasn't able to respond."
- **Connector permissions behave differently in Teams.** Some users see "manage connection" prompts, others don't. Non-admins can sometimes access connection management they shouldn't.
- **The "typing indicator then nothing" pattern.** Usually cold-start throttling or PDF knowledge source latency at scale. Migrate PDFs to SharePoint for stability.

## ALM & Lifecycle

- **Deleting knowledge sources is UI-only.** Check via API — the ghost reference is still there.
- **No version diffing or rollback.** You cannot compare agent versions or revert to a previous state.
- **Managed solutions + knowledge sources = vague SQL errors.**
- **Power Automate flows as declarative agent actions** may not run reliably and may not appear in the UI even when the counter says they exist.
- **Cloud flow 100-second timeout.** If your flow takes longer, the agent treats it as a failure. Put post-response logic after the "Return value(s) to Copilot Studio" step.

## Miscellaneous

- **Direct Line message size: 262,144 bytes.** Includes all context variables, not just the visible message.
- **Omnichannel ACS limit: 28 KB.** When transferring to Omnichannel, if all variables exceed 28 KB, the transfer succeeds but variables are silently dropped.
- **Connector payload: 5 MB public cloud, 450 KB GCC.** Generic error when exceeded.
- **GPT-4o/4.1 were widely regarded as poor in CPS.** GPT-5 is the turning point. Switching models can change agent behaviour — prompts that worked on one model may not work on another.
- **Suggested prompts cache aggressively.** After publishing, updates may not appear due to browser/Teams/CDN/service caching. May require clearing caches, new sessions, or removing and re-adding the Teams channel.

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
