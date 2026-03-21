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

Tight scope with explicit boundaries:

```
Handle billing questions and payment issues only.
If asked about technical problems or account changes, respond:
"That's outside my area. Let me redirect you."
```

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

## Disambiguation

If overlapping tools/agents exist ("Check balance" tool + "Get balance" agent):

- Differentiate descriptions clearly, OR
- Restrict one to explicit invocation only (clear "Allow agent to decide dynamically")
