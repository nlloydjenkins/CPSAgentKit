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

## Disambiguation

If overlapping tools/agents exist ("Check balance" tool + "Get balance" agent):

- Differentiate descriptions clearly, OR
- Restrict one to explicit invocation only (clear "Allow agent to decide dynamically")
