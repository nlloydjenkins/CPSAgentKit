# CPS Multi-Agent Patterns

## When to Use Multiple Agents

Split into multiple agents when:

- Parent's tool set exceeds ~25-30 tools and routing degrades
- Subtasks need different governance, auth, or access controls
- You want to reuse a capability across multiple parents
- Different teams own different domains

Do NOT split when:

- Simple, single-purpose agent
- Context-switching overhead outweighs routing benefit
- You need full-fidelity responses with citations (stripped in handoffs)

**Instruction decomposition:** Even though CPS allows up to 8,000 characters of instructions, dense specialist logic often works better when split into focused child agents or prompt tools before hitting the hard limit. Use child agents as a platform-level partitioning mechanism — each gets its own orchestration budget, tool limits, and knowledge scope. The tradeoff is additional orchestration latency per child.

## Child Agents vs Connected Agents

**Child agents:** lightweight, embedded in parent. Share parent's environment. Own instructions, knowledge, tools. Own orchestration limits (separate from parent). Not independently accessible. Use for logical grouping within one solution.

**Connected agents:** independently published. Own auth, own lifecycle. Must be published + sharing enabled. Can be reused across parents. Use when separate ownership, deployment, or governance is needed.

You can mix both. Connected agents can contain their own child agents.

## Child Agent Creation Paths

Use a two-path rule when building child agents:

1. **Portal-first remains the fallback** when the child agent needs tools, connector bindings, MCP servers, knowledge sources, prompt tools, flows, autonomous triggers, custom auth, or any portal-only setting and no verified export/API pattern exists for the exact child-owned artifact. When CPSAgentKit has a validated reference build or known-good export/API pattern plus tenant-specific connection/auth values, scaffold the child-owned artifact provisionally, but keep it staged until the child exists in the cloud, then require Apply Changes, portal inspection, Get Changes, and runtime validation.
2. **Guarded manual scaffold is required** for child-agent shells when an exported parent agent folder already exists, no portal-generated child folder exists yet, and a verified child-agent shape is available. Use this to create the child shell: routing description plus `settings.instructions`. Do not activate child-owned tools, knowledge, prompt tools, or settings in the same Apply Changes pass as a newly scaffolded child. Stage child-owned YAML as `.mcs.yml.staged` or defer API creation until Get Changes confirms the child cloud component exists. The maker must Apply Changes and verify portal acceptance before the child is marked fully accepted.

Child-owned artifacts require a two-pass ParentId-safe build order. Active child-owned `.mcs.yml` files under `agents/<Child>/actions/` can make Apply Changes fail with `ParentId does not exist on cloud: <schema>.agent.<Child>` when the child has not been created in the cloud yet. First pass: create the child `agent.mcs.yml`, parent tools, root connection references, topics, and settings. Second pass: after Apply Changes succeeds and Get Changes confirms the child exists, rename staged child-owned files to `.mcs.yml` and apply them.

Manual child-agent scaffolds must use a CPS-safe folder name without spaces or special characters, such as `agents/KnowledgeSpecialist/agent.mcs.yml`. Keep the human-readable display name with spaces in `mcs.metadata.componentName`, for example `Knowledge Specialist`.

The minimal scaffold shape is:

```yaml
mcs.metadata:
  componentName: Knowledge Specialist
kind: AgentDialog
beginDialog:
  kind: OnToolSelected
  id: main
  description: Answers Contoso IT procedure questions from the approved SharePoint IT Wiki. Does not create, check, update, or delete tickets; does not send notifications.
settings:
  instructions: |-
    # Knowledge Specialist V1.0

    You handle Contoso IT procedure knowledge ONLY.
```

Validation gates before marking the child as created:

- Folder path contains no spaces or special characters.
- Top-level `kind` is `AgentDialog`.
- `beginDialog.kind` is `OnToolSelected`.
- `beginDialog.description` has positive scope and explicit exclusions from sibling domains.
- Instructions live at `settings.instructions`, not top-level `instructions`.
- Instructions include a version stamp and sibling-domain prohibitions.
- YAML parser succeeds and VS Code CPS diagnostics show no errors.
- Apply Changes succeeds, and Copilot Studio shows the child relationship as enabled with no portal errors.
- Treat the scaffold as provisional until portal acceptance is observed or a Get Changes round-trip preserves the file.

## Architecture Pattern: Hub-and-Spoke

For complex solutions, use a router/orchestrator parent with specialised children:

```
User → Router Agent → Billing Agent
                    → Tech Support Agent
                    → Account Agent
```

The router's instructions focus purely on intent classification and delegation. Domain knowledge lives in the children.

## Known Limitations

### Response Summarisation

Connected agent responses are ALWAYS summarised by the parent. This is by design — the orchestration layer "sanitises" responses for consistency and security. Long, detailed responses get compressed. Citations and SharePoint links are stripped.

Partial workarounds:

- Instruct parent to return child responses as-is (sometimes helps)
- Use child agents instead of connected agents (slightly better)
- Expose sub-agent logic as a custom tool/API (bypasses summarisation)
- Instruct the parent to preserve downstream outputs as labeled blocks (e.g., `CU_RELEVANCE_RAW`, `CU_CLARITY_RAW`) rather than paraphrasing them. This reduces information loss when passing one child's output to the next step.

### Prompt Tools Over Child Agents for Summarisation-Sensitive Pipelines

Generative orchestration summarises child agent responses between stages. This is a platform behaviour, not an instruction issue, and it cannot be disabled. For specialist pipelines with strict output templates (numbered criteria, fixed headings, structured data), no amount of instruction work will reliably preserve the structure through multiple child-agent hops.

**Pattern:** replace child agents with AI Builder **prompt tools** invoked sequentially from a single `AdaptiveDialog` topic. The topic acts as deterministic orchestration; prompt tools are pure text-in, text-out transformation steps with no orchestration summarisation layer.

Empirical result from a 25+ iteration production build: multi-criterion coverage recovered from ~30-50% partial (narrative summaries losing criteria) to 100% complete (every criterion individually assessed) and held stable across subsequent releases.

**When to apply:**

- Specialist agents with strict output templates — numbered criteria, fixed headings, structured data
- Pipelines where every stage produces structured data that downstream stages must consume verbatim
- Scenarios where orchestration summarisation is destroying detail despite labeled-block instructions

**When NOT to apply:**

- Specialists that need their own tools, knowledge sources, or independent governance
- Agents intended for reuse across multiple parent orchestrators
- Pipelines where child-agent conversation state is genuinely useful

This pattern sits alongside the existing Output Preservation Pattern and Summary/Detail Pattern below: those two mitigate orchestration summarisation; prompt-tools-over-child-agents eliminates it for applicable scenarios. See `pipeline-patterns.md` for the topic-level structure (topic-owned linear pipeline).

### Output Preservation Pattern

When a parent agent needs to pass one child/tool/agent result to another downstream step, tell the parent to preserve the output as a labeled block rather than paraphrasing it. This is a mitigation for CPS generative orchestration, which normally summarises returned information into the final response. It reduces information loss but doesn't change the platform's underlying summarisation behavior.

Empirical confirmation from production: labeled raw blocks with uppercase ASCII `_RAW` suffixes (e.g. `RELEVANCE_RAW`, `CLARITY_RAW`) work reliably across 25+ iterations with stable downstream behaviour when combined with an assembly prompt instructed to reproduce the blocks verbatim.

**How to implement labeled output blocks:**

1. Each specialist child returns output with a distinct label prefix (e.g., `RELEVANCE_RESULT`, `CLARITY_RESULT`, `COMPLIANCE_RESULT`).
2. The orchestrator instruction explicitly states: "Preserve each specialist's returned output exactly as received. Do not summarise, compress, or rewrite any labeled result block."
3. When passing labeled blocks to the next stage (e.g., an Evaluator or Reporter), pass them as separately labeled sections, not merged into one blob.
4. The downstream consumer should be instructed to reproduce the labeled block content before adding any summary of its own.

**Structural validation:** Add a validation step where a QC/Evaluator agent checks that all expected labeled blocks are present and have the expected structural shape. For example: "Relevance must show 5 numbered criteria. Clarity must show 10. If counts are wrong, flag: DETAIL INCOMPLETE." This catches compression before it reaches the final output.

This pattern is especially important when multiple specialists feed into a Reporter or final-assembly step. Without it, later-stage sections are progressively more compressed as earlier sections consume more of the token budget.

### Child Agent Looping

Post-Oct 2025: child agents with tools (especially Send Email V2) fail to signal completion. Parent re-triggers in infinite loop.
Fix: Add explicit "end and return to parent" instructions in child + track completion with a variable on the parent side.

### Child Completion Behavior

After a child agent completes, the parent can be configured to: `Don't respond`, `Write the response with generative AI`, `Send specific response`, or `Send an adaptive card`. When using child agents as internal specialists in a larger plan, prefer output variables and downstream processing over immediate user-facing responses. Use the parent's "After running" behavior deliberately rather than accepting the default interaction style.

### MCP Tools Through Orchestration

MCP server tools on child agents are NOT invoked when called via parent orchestration. The child fires, MCP calls don't execute. Workaround: use agent flows with native connector actions and manual parameter passing.

Field observation: MCP is more reliable when the parent/orchestrator owns the MCP tool. Fetch what's needed at the parent level and pass results to children as context rather than relying on MCP execution inside child-agent orchestration.

### No Circular Dependencies

Agent A → Agent B → Agent A is blocked. Use hub-and-spoke.

### No Multi-Level Chaining

Parent → child → child's child is blocked. Flatten, or use child agents within connected agents.

### The Ghost Message / explanation_of_tool_call Leaking

Generative orchestration "thinking" messages (`explanation_of_tool_call`) leak through to the user as a general platform behavior. This is not limited to the narrow case of "parent with no topics + 'Don't respond' after child" — it happens broadly even with explicit "NEVER display reasoning" instructions.

**Mitigation:** Keep instructions action-oriented ("EXECUTE step 1", not "plan step 1"). Avoid instructions that describe reasoning processes. This reduces but does not eliminate the leaking — it is a platform behavior, not an instruction failure.

## Data Handoff

- Conversation history passed by default to connected agents
- For child agents, orchestration manages context internally
- Conversation history limited to 10 turns — critical state must be in variables
- Pass specific parameters via input/output variables when possible rather than relying on history

## Governance

- Log when connected agents are invoked — separate transcripts per agent
- Correlate parent and child sessions via telemetry identifiers
- Connected agents may have different privileges or knowledge — apply audit controls
- Auth must be compatible: if child requires auth, parent must use same method
- Manual auth (Generic OAuth2) on parent is not compatible with authed connected agents

## When to Promote Child → Connected

Promote a child agent to a connected agent when:

- You want to reuse it across multiple parents
- It needs separate publishing/versioning
- Different teams need to own and maintain it
- It needs different auth or governance rules

## Specialist Agent Patterns

These patterns apply to multi-agent architectures where specialists work as a pipeline (e.g., review systems, assessment workflows, content processing).

### Evaluator / QC Agent

For complex multi-agent outputs, add a dedicated Evaluator (quality control) agent as the last specialist step before final assembly. The Evaluator does not perform domain analysis — it validates the outputs of the other specialists.

Responsibilities:

- **Arithmetic consistency** — scores sum correctly, percentages match thresholds, colour ratings align with numeric scores
- **Cross-agent conflict detection** — Brand recommendation conflicts with Compliance requirement, or Clarity suggestion removes a necessary disclaimer
- **Structural completeness** — all expected sections present, all required criteria assessed, no sections silently dropped; includes expected criterion counts per specialist (e.g. "Clarity must show 10 criteria — flag if fewer")
- **Scope boundary compliance** — no agent has leaked into another's domain
- **Summary-vs-detail accuracy** — when specialists produce dual-layer output (summary + detail), verify that each summary accurately represents the underlying detail. Summaries that omit findings or inflate scores relative to the detail block indicate compression or instruction drift in the specialist.
- **Colour/band threshold classification** — when specialists map numeric scores to RAG bands or thresholds, verify the band matches the score
- **Placeholder detection** — catch specialists returning template content (e.g. literal `[Criterion 1 text]`) instead of real assessment output

The Evaluator's output must appear in the final report even if no issues are found (e.g., "Arithmetic verified. No conflicts. All outputs align."). An empty QC section undermines trust in the review.

Advanced pattern: add a **Structural Completeness Gate** with explicit PASS/FAIL checks and machine-readable output (e.g., `FAILED_CHECK: Clarity shows 4 criteria, expected 10`). This makes regression detection systematic.

### Reporter / Format Normaliser Agent

The Reporter Agent is distinct from the orchestrator. The orchestrator coordinates; the Reporter takes validated outputs from all specialists and produces a single, consistent artifact.

- **Fixed report structure** — the Reporter owns the section order, headings, and table formats. Define these as a literal template in its knowledge files.
- **Terminology normalisation** — standardise language across agents so the final report reads as one coherent document
- **Deduplication** — remove overlapping findings that multiple specialists flagged
- **Detail reproduction, not summarisation** — instruct the Reporter to reproduce specialist detail verbatim before adding any summary. The most persistent failure is the Reporter compressing specialist output into narrative.
- **Summary-only variant** — for pipelines with many specialists, an alternative to detail reproduction: each specialist emits a compact structured summary alongside the full detail, and the Reporter receives only the validated summaries. This eliminates the token budget pressure that causes progressive compression of later sections. The full detail remains accessible through specialist-only topics for drill-down. Use this variant when the number of specialists makes full-detail reproduction impractical; use the detail-reproduction approach for simpler pipelines where full evidence in the report is desired.
- **Final artifact suppression** — "The report is the final output. Do not append follow-up questions, offers, or conversational prompts."

### Versioning and Regression Detection

Stamp every agent with a version number in its instructions and require it in output (e.g., "ReviewBot V2.1" at the top of every report). This enables:

- **Regression detection** — when output quality drops, you know which version produced it
- **Feature adoption tracking** — after each iteration, produce a Feature Adoption Check: which changes were expected in the output, which appeared, which regressed
- **Structured test-evaluate-fix cycle** — define a scoring rubric for output quality before the first live test. After each test, produce a structured review comparing output against the rubric. Track a version history with scores to see trajectory and catch regressions early.

Without version stamps and structured reviews, iteration is ad-hoc and regressions go unnoticed until users report them.

### Specialist Summary/Detail Pattern

For pipelines with many specialists feeding into a Reporter, a dual-layer output pattern prevents the progressive compression that occurs when full specialist outputs are passed through orchestration layers.

Each specialist emits two distinct output layers:

1. A structured summary block - compact, labeled, containing only scores, key findings, and top-level recommendations. This is the unit of downstream consumption.
2. A detailed assessment block - full per-criterion evidence, all supporting reasoning, and complete analysis. This is the unit of validation.

The pipeline flow is:

1. Each specialist produces both layers in a single response, clearly separated by labels (e.g., `SUMMARY_START` / `SUMMARY_END`, `DETAIL_START` / `DETAIL_END`).
2. The Evaluator receives both layers and validates summary accuracy against the detail (see summary-vs-detail accuracy under Evaluator responsibilities).
3. The Reporter receives only the validated summary blocks and assembles the final report from them. Full detail is never passed to the Reporter.
4. Specialist-only topics provide direct access to the full detailed output for any individual specialist, giving users a drill-down path from the summary report to the underlying evidence.

This pattern solves a specific failure mode: when multiple specialists contribute full-detail outputs to a Reporter, later sections are progressively more compressed as earlier sections consume more of the token budget. By routing only compact summaries to the Reporter, that pressure is eliminated.

Use this pattern when the pipeline has 4+ specialists and full-detail reproduction in the report is impractical. For simpler pipelines with 2-3 specialists, the standard Output Preservation Pattern with labeled blocks and detail reproduction is sufficient.

When specialists are implemented as prompt tools rather than child agents, this pattern is especially effective - prompt tools eliminate the orchestration summarisation layer entirely, and the dual-layer output structure maps cleanly to the prompt tool's text-in/text-out interface.

## Agent Boundary Enforcement

In multi-agent architectures, specialist agents will leak into each other's domains unless explicitly prohibited. The model defaults to commenting on anything it notices in the content, regardless of scope instructions.

Positive scope alone is insufficient. Add explicit prohibitions:

```
You review brand compliance only.
Do NOT assess: reading age, accessibility formats, support routes,
regulatory compliance, or FCA rules. These belong to other specialists.
```

When one agent leaks into another's domain, the fix is an explicit prohibition instruction, not a restatement of the positive scope. The more specialist agents you have, the more important this becomes.

### Cross-Agent Consistency

When a child's scope changes, update:

1. Child's description
2. Parent's routing instructions
3. Sibling descriptions that previously claimed that domain

## Autonomous Agents and Event Triggers

Agents can be triggered by external events without user interaction via scheduled triggers (time-based) or event-based triggers (e.g., Dataverse record update, email received).

### Key Constraints

- **Event-triggered agents use only the maker's credentials.** Tools called in response to a trigger must also use maker's credentials. The agent operates with the permissions of whoever built it, not the end user.
- **Autonomous runs always consume Copilot Credits** regardless of user licensing. Even if all users have M365 Copilot licences, scheduled/background agent runs are billed.
- **Event triggers can be blocked by DLP policy.** Admins can prevent makers from adding event triggers to agents.

### Design Guidance

- Define expected sequences of actions for multi-step workflows.
- Model each step with explicit preconditions, post-conditions, and numerical thresholds.
- Design for idempotency with robust retry logic and dead-letter handling.
- Incorporate approval gates through familiar channels (Teams, Outlook) for human-in-the-loop review.
- Enforce least-privilege: scope connector permissions, use managed identities, apply MCP tool access policies.
- Combine process instructions with specific prompts in the agent's instructions.

### Security

Triggers are vulnerable to injection attacks. Instructions should include:

- Limit which tools the agent can invoke from triggers
- Limit parameters (e.g., "only email to @contoso.com addresses")
- "Only email information after checking a knowledge source for context"

## Autonomous Pipeline Output Compaction

In autonomous multi-agent pipelines, verbose/narrative child agent outputs cause `SystemError` at later pipeline stages as accumulated context exceeds the orchestrator's processing capacity. This is distinct from `OpenAIMaxTokenLengthExceeded` — it manifests as a generic `SystemError` with no useful diagnostic detail.

**Pattern:** Child agents in autonomous pipelines must produce compact, machine-oriented output:

- Key-value pairs or structured data instead of narrative prose
- Labeled blocks (e.g. `RESULT: reference=APP-001, status=Ready for Processing, email_type=Initial Application`)
- Only the data the next pipeline step needs — no explanatory text, no conversational wrap-up

**Escalation path when SystemError persists:**

1. Reduce parent orchestrator prompt length
2. Compact all child agent outputs to machine-oriented format
3. If still failing → switch to a CPS workflow (deterministic orchestration) rather than adding more prompt text

The workflow approach removes the token overhead of generative orchestration planning and gives explicit control flow.

## Autonomous Pipeline Pattern (Trigger-Driven)

When an agent is triggered by an event (email, scheduled run) rather than user conversation, the pipeline must execute end-to-end without user interaction. This creates unique challenges versus interactive agents.

### Key Differences from Interactive Agents

1. **No user to clarify ambiguity mid-pipeline.** Every decision point must have a programmatic path — the agent cannot ask the user. Use verdict-based routing (PROCEED / REQUEST_INFO / ESCALATE) rather than open-ended questions.
2. **Early termination is silent.** In interactive mode, stopping early at least shows the user something. In autonomous mode, stopping early means the trigger was consumed but no action was taken — invisible failure.
3. **Context accumulates rapidly.** Each pipeline stage adds to the conversation context. Five child agents with detailed outputs can exceed token limits. Context summarisation between stages is not optional — it's required.
4. **Tool ordering is critical.** The orchestrator must create the parent record (application) before logging child records (correspondence, compliance). State dependencies explicitly.

### Instruction Template for Autonomous Pipelines

```
## Workflow stages — follow in order, do NOT stop early

CRITICAL: Every inbound [trigger] MUST progress through ALL stages below.
Do NOT stop after [first child]. Do NOT display child agent outputs to
the user — they are internal pipeline data. Continue through every stage
until [final action] is complete or the case is escalated.

1. [Initial data operation — create/lookup record]
2. Pass [specific context] to `Child Agent A`. Do NOT show output — proceed to stage 3.
3. Pass ONLY [what child B needs] to `Child Agent B`. Do NOT show output — proceed to stage 4.
   ...
   N. Only after all stages complete, display: "Pipeline complete for [ref]."
```

### Dataverse Writes in Autonomous Pipelines

If the pipeline writes to multiple tables, use pre-bound connector actions (one per table) to avoid UnresolvedDynamicType. See constraints.md → Dataverse Connector — Dynamic Schema Binding. State the write order explicitly and reference each tool by its exact `/ToolName`.
