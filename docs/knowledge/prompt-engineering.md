# CPS Prompt Engineering

## The Prompt Architecture

There is no single "system prompt" in CPS. Behaviour is shaped by multiple layers:

1. **Agent Instructions** (Overview page) — global behaviour, tone, scope, guardrails
2. **Descriptions** (on topics, tools, agents, knowledge) — primary routing mechanism in generative orchestration
3. **Topic-level instructions** (generative answers nodes) — per-intent customisation
4. **Prompt actions** — standalone prompt tools with own model settings and temperature

## Agent Instructions — What Works

- **Positive instructions > negative.** "Respond only to questions about X" works. "Don't answer questions about Y" is unreliable.
- **If-then structures:** "If the user asks about pricing, respond with..."
- **Explicit fallback paths:** "If you cannot find the answer, respond with 'I don't have that information.'"
- **Reference tools by exact name** using `/` syntax. Critical when >5 tools.
- **Number sequential instructions** and state they must be followed in order.
- **Use action verbs:** Get, Use (for retrieval); From, With (for acting on results); When, If (for conditions).
- **Structure as: constraints + response format + guidance.**

### Instruction Length Guidelines

- **Simple single-purpose agents:** 500–2,000 characters is typical and healthy
- **Multi-tool agents with routing logic:** 2,000–4,000 characters
- **Autonomous pipeline orchestrators:** up to 5,500 characters (budget for tool references)
- **Hard limit:** 8,000 characters — quality may degrade before this with dense content
- **Decomposition signal:** If instructions exceed ~3,000 characters for a specialist or ~5,500 for an orchestrator, the fix is structural (child agents, prompt tools, knowledge files) not more text

## Agent Instructions — What Doesn't Work

- Negative constraints as primary control ("never mention competitors" — will be violated)
- Attempting to control search retrieval through instructions (ignored)
- Very long instruction sets (hard limit is 8,000 chars; quality may degrade before the limit with dense or complex instructions)
- Overriding platform safety/content filtering
- Vague terms ("show in the typing box")
- Instructing professional tone (it's already the default)

## The Instruction Accumulation Trap

Field observation from production multi-agent deployments: adding more instructions does not linearly improve output. After a certain density, new instructions can cause regressions in previously-working behaviour. This is distinct from hitting the 8,000-char limit — it's a quality plateau that occurs well before the hard cap.

Symptoms:

- Output quality plateaus or regresses after adding instructions
- Agent produces false compliance language (e.g., metadata claiming "all detail preserved" when output is visibly compressed)
- Later sections of output degrade as earlier sections consume more of the token budget
- Previously-working features break when new instructions are added alongside them

The fix is structural, not textual:

- Decompose into child agents or prompt tools rather than adding more text
- Move assessment methodology (scoring, output templates, worked examples) to knowledge files — keep domain rules in instructions
- Simplification and removal can improve output more than additions
- Prefer structural enforcement (labeled blocks, validation agents, literal templates) over more prose instructions

Design principle: "Do not respond to every gap by adding more prose instructions." When output quality stops improving, the problem is architecture, not wording.

## Instructions Are Treated Like Code

Microsoft's own guidance: if complex instructions produce unexpected results, remove ALL instructions and add back one at a time, testing between each. Instructions interact in unexpected ways.

## Descriptions — The Most Important Skill

In generative orchestration, descriptions are the primary routing mechanism. The orchestrator reads descriptions of every topic, tool, child agent, and knowledge source to decide what to invoke.

### For Topics

Answer: "What user intent does this handle, and what does it NOT handle?"

- Good: "Handles requests to check existing ticket status. Requires ticket ID. Does not create or modify tickets."
- Bad: "Support ticket topic."

### For Tools

Dual purpose: tells orchestrator when to invoke AND helps generate input collection questions.

- Good: "Retrieves customer booking history from CRM. Call when user asks about past bookings. Requires customer ID or email."
- Bad: "Gets bookings."

### For Child/Connected Agents

Write as a tool description from the parent's perspective.

- Good: "Handles all IT hardware questions — ordering, warranty, troubleshooting. Does not handle software licensing."
- Bad: "IT agent."

### For Knowledge Sources

Critical at scale (>25 sources triggers GPT-based filtering on descriptions).

- Good: "UK employee benefits handbook covering health, dental, vision, retirement. Updated quarterly. UK employees only."
- Bad: "Benefits docs."

### For Input Parameters

Names must be human-readable — the orchestrator generates questions from them.

- Good: "start_date" with description "First day of requested leave (DD/MM/YYYY)"
- Bad: "dt_start" with no description

## Multi-Agent Prompt Patterns

### Parent Agent

Focus on routing, not domain knowledge:

```
Route requests as follows:
- Billing questions → /Billing Agent
- Technical support → /Tech Support Agent
- Account changes → /Account Agent
If unclear, ask the user to clarify before routing.
Do not answer domain-specific questions directly.
```

### Child Agent

Tight scope with explicit boundaries — both positive scope (what it handles) AND negative scope (explicit prohibitions):

```
Handle billing questions and payment issues only.
If asked about technical problems or account changes, respond:
"That's outside my area. Let me redirect you."
```

### Agent Boundary Enforcement

Specialist agents leak into each other's domains unless explicitly prohibited. Positive scope alone is insufficient — add explicit prohibitions stating what each agent must NOT assess. See multi-agent-patterns.md → Agent Boundary Enforcement for the full pattern with examples.

### Cross-Agent Consistency

When a child's scope changes, update the child's description, parent's routing instructions, and sibling descriptions that previously claimed that domain.

## Follow-Up Questions

Instruct the agent to suggest relevant follow-ups referencing available tools. Example: after answering weather in Rome, offer "Would you like tomorrow's forecast?"

**Critical caveat:** Follow-up questions ONLY work when "Use general knowledge" is enabled. Disable it and the agent can't ask clarifying questions — they're considered "ungrounded" and silently suppressed.

## Citation Preservation

Add to instructions if you need citations in responses:

```
WHEN GENERATING A SUMMARY ALWAYS MAINTAIN ALL CITATIONS.
Preserve all tags in the format [^x_y^] exactly as they appear.
Don't alter, add, or remove any tags.
```

## Output Format Enforcement

Prose descriptions of output format ("include a table with scores") are unreliable — the model defaults to trained summary behaviour rather than following multi-step formatting instructions embedded in system prompts. This is one of the most persistent failure modes in production multi-agent deployments.

### Literal Templates with Placeholders

Instead of describing what the output should look like, show the exact structure:

```
### [Pillar Name] (Score: X.X – [Colour])

**Criteria Assessment:**
- **[Criterion 1 text]:** Met / Partially met / Not met — [evidence]
- **[Criterion 2 text]:** Met / Partially met / Not met — [evidence]

**Strengths:** [specific examples quoted]
**Issues:** [specific problems with suggested improvements]
```

Put these templates in knowledge files rather than instructions — they're longer but only needed during execution, and this preserves instruction space for domain rules.

### Worked Examples (Few-Shot)

Add one worked example per output section showing the template filled in with realistic content. Keep examples short but precise — long examples consume token budget. The example should demonstrate the exact depth and format expected.

### Negative Examples

For persistent bad patterns, show what NOT to produce:

```
Do NOT compress criteria into a narrative paragraph like this:
"All mandatory criteria met: strong hierarchy, clear tone, logical grouping."

DO produce numbered criteria with individual assessments like this:
1. **Paragraphs max 4 lines:** Met — longest paragraph is 3 lines.
2. **Strong visual hierarchy:** Met — clear H1/H2/body distinction.
```

### The Show-Don't-Tell Principle

When procedural instructions fail to produce the desired output format, switch to showing examples. The combination of literal template + one worked example + one negative example is the most reliable format enforcement pattern observed in production. This shift — from "telling the model what to do" to "showing the model what correct output looks like" — consistently produces the largest output quality improvements.

## Final-Artifact Suppression

Field observation: CPS generative orchestration is optimised for conversational helpfulness, which is the wrong behavior for fixed-format outputs. If the desired output is a final artifact (report, scored result, structured data) rather than a conversational exchange, explicitly tell the agent:

- The result is final
- Do not append offers, follow-up prompts, or conversational wrap-up text
- Do not paraphrase or summarise the output

This is especially important in multi-agent flows where the final step produces a structured deliverable.

## Autonomous Agent Security

Triggers are vulnerable to injection attacks. Instructions should include:

- Limit which tools the agent can invoke from triggers
- Limit parameters (e.g., "only email to @contoso.com addresses")
- "Only email information after checking a knowledge source for context"

## Custom Triggers in Generative Orchestration

Three trigger types hook into the agent's lifecycle:

### On Knowledge Requested

- Fires right before the agent queries knowledge sources.
- Provides read-only access to the search phrase the agent intends to use.
- Lets you route queries to a proprietary index or inject additional data into results.
- **Advanced/hidden trigger** — not visible in UI by default, must be enabled via YAML edit (name a topic exactly `OnKnowledgeRequested`).

### AI Response Generated

- Fires after the AI composes a draft answer but before it's sent to the user.
- Lets you programmatically modify the response or citations (fix formatting, replace URLs, redact content).
- Can yield a custom message and use a `ContinueResponse` flag to control whether the original response still sends.
- Use for last-second adjustments; heavy use suggests logic that should be in main instructions instead.

### On Plan Complete

- Fires after the entire plan executes and the response is sent.
- Use for end-of-conversation processes (redirect to survey, cleanup actions).
- Add conditional logic — you probably don't want this firing after every single user message in a multi-turn conversation.

## Prompt Tools as Architectural Building Blocks

Prompt tools (prompt actions) are not just for simple text generation — they are a key architectural component for multi-agent solutions. Use prompt tools instead of child agents when you need:

- **Code interpreter access** — only available through prompt tools, not at the agent level
- **Temperature control** — only configurable in prompt tools, not agent instructions
- **Deterministic format transformation** — e.g., converting narrative specialist output into structured JSON for the next pipeline stage
- **File processing** — converting uploaded PDF/DOCX to HTML/Markdown before delegation
- **Single-purpose AI calls** without orchestration overhead — no separate tool limits, no summarisation layer, lower latency than child agents

### When to Use Prompt Tools vs Child Agents

| Use a **prompt tool** when:                            | Use a **child agent** when:                          |
| ------------------------------------------------------ | ---------------------------------------------------- |
| Task is a single focused AI call                       | Task requires its own tools or knowledge             |
| You need code interpreter or specific temperature      | Task needs separate governance or auth               |
| Input → output transformation (e.g., narrative → JSON) | Task is complex enough to need its own orchestration |
| Preprocessing or postprocessing step                   | Task will be reused across multiple parents          |
| You want to avoid orchestration overhead               | Task benefits from its own instruction space         |

### Pattern: Prompt Tool as Format Enforcer

A powerful pattern from production: specialist agent produces narrative output → prompt tool reformats it into structured data for the next stage. This adds a deterministic extraction step that enforces output structure more reliably than instructions alone. The prompt tool can use a lower temperature for consistency.

### Authoring

Prompt tools are portal-first — create in Copilot Studio or AI Hub, then sync locally and refine. This is the supported workflow. They appear as `TaskDialog` with `InvokeAIBuilderModelTaskAction` in the YAML.

For YAML syntax details including `InvokeAIBuilderModelAction` structure, output bindings, Power Fx expression patterns, and the `predictionOutput` parsing chain, see `yaml-syntax.md`.

### Runtime Ownership

When specialists are implemented as prompt tools, the prompt tool's instruction text in the CPS portal is the authoritative runtime configuration. If a specialist was previously a child agent and was migrated to a prompt tool, the child agent YAML becomes a reference artifact - not the running code. When debugging output quality issues, edit the prompt tool text in the portal (or via AI Hub), not the original agent YAML. Sync locally after changes to keep the workspace current.

## Multi-Stage Pipeline Orchestration

When the parent agent must execute a strict sequence of child agents (e.g., interpret → assess → draft → compliance check → format → send), generative orchestration requires explicit stage-by-stage control.

### The Pipeline Control Pattern

1. **CRITICAL header:** State upfront that every trigger MUST progress through ALL stages. Name the stages.
2. **Per-stage suppression:** After each child agent invocation, explicitly state "Do NOT show this output to the user — immediately proceed to stage N." The orchestrator needs this at every stage — a single top-level instruction is insufficient.
3. **Final-stage-only output:** Only the last stage should produce user-visible output. For autonomous agents, this is typically an internal summary ("Pipeline complete for [ref]. Email sent to [email].").
4. **Numbered stages:** Number every stage and reference them by number. "Proceed to stage 3" is more reliable than "proceed to the next step."
5. **Context minimisation:** At each stage handoff, specify what to pass and what NOT to pass. "Pass ONLY the draft text to Compliance Evaluator — do NOT include extracted fields, Dataverse results, or prior stage outputs."

### Tool Sequencing Within a Pipeline

When tool calls must happen in a specific order (e.g., create record BEFORE logging correspondence):

- Number the tool calls in the workflow stages
- State the dependency explicitly: "Log correspondence (stage 8) — this requires the application reference number from stage 1"
- Do NOT assume the orchestrator will infer ordering from context

### Revision Loops

For compliance-check-and-revise loops:

- State the maximum iteration count explicitly: "Maximum 2 revision cycles"
- Define the escalation path: "On third failure, escalate to Teams"
- The loop should be self-contained within the numbered stages, not an implicit behaviour

## Specialist Output Shape for Autonomous Pipelines

In autonomous multi-agent pipelines, child agents should return **compact machine-oriented outputs**, not polished human-readable prose. Even when the parent is well constrained, verbose child outputs increase token usage and make the orchestrator more likely to treat them as user-facing responses.

### Preferred Pattern

- **Interpreter / classifier agents:** return short labeled fields only
- **Decision agents:** return compact verdict blocks
- **Compliance agents:** return verdict + failing rules + one revision instruction
- **Formatter agents:** return only the final transformed artifact, with no notes or commentary

### Example Shapes

```text
VERDICT: REQUEST_INFO
MISSING: effective_date, other_parties
AMBIGUOUS: change_type
CONTRADICTIONS: None
REASON: Required fields for change of tenancy are incomplete.
```

```text
VERDICT: FAIL
FAILING_RULES: rule_2, rule_5
REVISION: Remove the processing timescale and replace it with a neutral review statement.
NOTES: Internal jargon still present.
```

### Rules

- Tell specialist agents to return **no prose introduction** and **no conversational wrap-up**.
- Keep outputs under a fixed line budget where possible (for example: 6-12 lines).
- If the child agent produces the final artifact (for example, the accessible email body), require it to return **only** that artifact.
- The parent should treat child outputs as hidden pipeline state, not as conversation content.

## Record Creation Order in Trigger-Driven Pipelines

For trigger-driven pipelines, do not create the primary Dataverse record until after the first extraction/classification stage has produced the minimum required fields.

### Correct order

1. Query for existing record using trigger metadata (for example: thread id, sender email)
2. Run extraction/classification child agent
3. If no record exists, create the Dataverse row using trigger metadata plus extracted fields

### Why

- If the create step comes before extraction, the planner treats required columns like `applicant_email` and `applicant_name` as missing interactive inputs
- This often causes the autonomous agent to ask the user a question instead of continuing the pipeline
- Trigger metadata such as sender email should be treated as pipeline context, not user input

## Cross-Agent Rule Embedding for Drafter-Evaluator Pairs

When an agent pipeline includes both a content drafter and a compliance evaluator:

1. **The evaluator owns the full rule set** — detailed rule descriptions, examples of pass/fail, revision instruction templates. These live in a knowledge source attached to the evaluator.
2. **The drafter owns the actionable output requirements** — the specific disclosures, permitted phrasings, and prohibited content that the evaluator will check. These are embedded directly in the drafter's instructions (not a knowledge source, because they must always be in context).
3. **The two must stay in sync.** When a new compliance rule is added, update the drafter's "Required disclosures" or "Prohibited content" section in the same change. A mismatch guarantees first-pass failure.

### What goes where

| Content                                           | Where                                   | Why                                         |
| ------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| Full rule definitions with rationale and examples | Evaluator knowledge source              | Only needed during evaluation, not drafting |
| Required disclosure text and templates            | Drafter instructions                    | Must always be in context during drafting   |
| Permitted phrasing ("aim to" not "will")          | Drafter instructions                    | Prevents unauthorised commitments at source |
| Prohibited content categories                     | Both drafter and evaluator instructions | Drafter avoids it; evaluator catches it     |
| Revision instruction templates                    | Evaluator knowledge source              | Only used when generating revision feedback |

This pattern eliminates the most common cause of compliance retry loops: the drafter simply didn't know what the evaluator would check.

## Disambiguation

If overlapping tools/agents exist ("Check balance" tool + "Get balance" agent):

- Differentiate descriptions clearly, OR
- Restrict one to explicit invocation only (clear "Allow agent to decide dynamically")
