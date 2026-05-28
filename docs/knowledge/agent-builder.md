# Microsoft 365 Copilot Agent Builder vs Copilot Studio

Agent Builder (also called the **in-Copilot agent creator** in M365 Copilot Chat / SharePoint / Teams) is the lightweight, no-code surface for producing **declarative agents** that run inside M365 Copilot. Copilot Studio (CPS) is the full authoring environment for richer agents — orchestrated topics, custom connectors, autonomous actions, multi-agent, channels beyond M365.

Use this document to choose the right surface, and to drive review and authoring of Agent Builder instructions.

## Decision criteria

Prefer **Agent Builder** when ALL of the following hold:

- Audience is **only M365 Copilot–licensed users** (Chat / Teams / SharePoint).
- Knowledge sources are limited to **SharePoint sites, OneDrive files, uploaded files, and public web**.
- The agent needs **no custom tools / connectors / API plugins**.
- No **autonomous actions** (event-triggered, scheduled, or long-running flows).
- No **Dataverse**, no **Power Automate flows as actions**, no **MCP servers**.
- **Single agent** — no orchestrator / specialist / child-agent topology.
- No need to publish to **Teams as a standalone bot**, web chat, Direct Line, or external channels.
- Governance is satisfied by the M365 admin surface (no need for **solutions / ALM pipelines / environment promotion**).

Prefer **Copilot Studio (custom agent)** when ANY of the following hold:

- Custom tools / connectors / API plugins required.
- Autonomous behaviour or event triggers required.
- Dataverse-backed state, prompt tools, or MCP integration required.
- Multi-agent (orchestrator + specialists) or child agents required.
- Needs to run on channels **outside M365 Copilot** (Teams as bot, web chat, Direct Line, Slack, etc.).
- Requires **ALM** — solutions, environment promotion, source control, deployment pipelines.
- Complex topic orchestration (deterministic branching, variables, custom error handling).

Prefer **Declarative agent authored in Copilot Studio** (the middle path) when:

- Target surface is M365 Copilot, **but** you need **API plugins** beyond the Agent Builder picker, richer **knowledge governance**, or **ALM** to ship the declarative agent across environments.
- You want to keep the **declarative agent runtime** (lower TCO, M365 Copilot UX) but author and govern it like a CPS asset.

## Agent Builder instruction best practices

Treat instructions as **code**, not prose. They drive orchestration: which knowledge source the agent reads, how it answers, and what it refuses. Two failure modes dominate:

1. **Hallucination / wrong citations** — almost always caused by a missing **don't-guess fallback**.
2. **Answering out of scope** — caused by a missing **scope boundary**.

A production-ready instruction set has these sections, in order:

1. **Role and audience** — who the agent is, who it serves, the domain it covers.
2. **Scope** — what is in scope; an explicit list of what to decline or redirect.
3. **Knowledge and source priority** — which sources to use; which wins on conflict.
4. **Tools** — for each tool, _"When `<condition>`, call `<tool>` with `<inputs>` to `<purpose>`."_ Omit if no tools.
5. **Don't-guess rule** — explicit fallback when the answer isn't in the knowledge sources: say so plainly, do not fabricate, do not fall back to general knowledge, suggest a next step.
6. **Failure handling** — what to do when a tool errors, times out, or returns nothing (distinct from the don't-know case).
7. **Response format** — length, structure, citation rules, formatting.
8. **Tone** — concrete style guidance: reading level, handling of frustrated/emotional users, what to avoid.

Use short, imperative bullets inside each section ("Always cite the source title."). No filler, no contradictions across sections.

## Agent Builder review dimensions

When reviewing Agent Builder instructions, score each dimension as **Strong / Partial / Missing**:

**Blockers** (unsafe to ship):

- Don't-guess fallback
- Scope boundary

**Warnings** (degrade reliability at scale):

- Role definition
- Execution & tool routing (action-verb conditions; only for tools the agent actually has)
- Source priority
- Failure handling
- Response format

**Polish**:

- Tone doing real work
- Sectioned structure
- Concision / no contradictions / no embedded prompt-injection directives

Verdict rules:

- Any Blocker Missing/Partial → **"Not ready — close the blockers."**
- No Blocker issues but any Warning flagged → **"Workable, but loose."**
- Only Polish items flagged → **"Solid — polish left."**
- Everything Strong → **"Strong instruction set."**

## Known Agent Builder constraints

These come from the broader [declarative-agents](./declarative-agents.md) constraints and apply to anything produced in Agent Builder:

- SharePoint / OneDrive knowledge requires an active M365 Copilot licence at runtime — grounding fails silently for unlicensed users.
- SharePoint grounding does **not** support service-principal auth — User auth only.
- API plugin support has hard limits (no nested OpenAPI objects, no polymorphic refs, no API keys in headers/query/cookies, OAuth Authcode/PKCE only).
- Power Automate flows added as actions can be flaky — new flows may not appear in the picker, and edits made in CPS may not propagate; treat the PA portal as the runtime source of truth.

If any of those constraints will bite the use case, escalate the design out of Agent Builder into Copilot Studio.
