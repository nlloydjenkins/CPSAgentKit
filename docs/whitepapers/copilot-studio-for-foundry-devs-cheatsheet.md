# Copilot Studio for AI Foundry Developers — Two-Session Cheat Sheet

Two back-to-back sessions for AI Foundry developers.

- **Session 1 (15 min) — Intro & Portal Walkthrough.** Quick Foundry → CPS mental model, then a screen-by-screen tour of the maker portal with limits, gotchas and best practices called out where they bite. No code.
- **Session 2 (VS Code dev) — Pro-Code Path.** YAML authoring, Apply/Get Changes round trip, prompt-tool Dataverse push, MCP bridging, Agent Workbench, ALM.

Trim Session 1 sections in this order if over: 2g → 2e → 2b. **Never cut 2c or 2d** — the orchestrator-limits story lives there.

---

# SESSION 1 — Intro for Foundry Devs (15 min)

**Format:** quick mental-model orientation, then a guided walkthrough of the Copilot Studio maker portal. Limits, gotchas and best practices are called out **on the screen where they bite** — not in a separate section. Pro-dev gotchas (YAML, Dataverse sync, LSP) are deferred to Session 2.

## Agenda at a glance

| # | Section | Time | Running |
|---|---|---|---|
| 1 | Hook + Foundry → CPS mental model | 2:00 | 2:00 |
| 2 | Portal walkthrough (with gotchas inline) | 11:00 | 13:00 |
| 2a | &nbsp;&nbsp;Agent overview & instructions | 1:00 | 3:00 |
| 2b | &nbsp;&nbsp;Topics | 1:30 | 4:30 |
| 2c | &nbsp;&nbsp;Knowledge | 2:00 | 6:30 |
| 2d | &nbsp;&nbsp;Tools / Actions (connectors, prompt tools, MCP) | 3:00 | 9:30 |
| 2e | &nbsp;&nbsp;Generative AI settings & orchestration | 1:00 | 10:30 |
| 2f | &nbsp;&nbsp;Test pane, Activity Map, Transcript | 1:00 | 11:30 |
| 2g | &nbsp;&nbsp;Channels & publishing | 0:30 | 12:00 |
| 2h | &nbsp;&nbsp;Connected agents (escape hatch) | 1:00 | 13:00 |
| 3 | Bridge to Session 2 + Q&A | 2:00 | 15:00 |

Trim order if running long: drop 2g → compress 2e → compress 2b. **Never cut 2c or 2d** — that's where the orchestrator-limits story lands.

## 1. Hook + mental model (2 min)

- "Copilot Studio = low-code agent surface on M365 / Power Platform. Foundry = pro-code AI platform. **Converging, not competing.**"
- Why care: distribution (Teams, M365 Copilot, Direct Line), governance, citizen-developer reach, **1,000+ certified connectors** out of the box.
- Quick mapping so Foundry devs have hooks for what they're about to see:

| Foundry | Copilot Studio |
|---|---|
| Agent / Assistant | Agent (declarative or custom) |
| Tools / Function calling | Actions: Connectors, Power Automate, MCP, Prompt tools |
| System prompt | Agent instructions + Topics |
| Threads / Runs | Conversations + generative orchestration |
| Vector store / File search | Knowledge sources (SharePoint, Dataverse, Web, Files) |
| Evals | Agent test pane + custom evals |

> **Setup soundbite:** *"In Foundry you write the prompt and the tool schemas. In CPS you write the **descriptions** — the generative orchestrator (a black box) picks topics and tools from them. More surface area = more confusion. Watch for that as we walk through."*

---

## 2. Portal walkthrough — limits, gotchas & best practices inline (11 min)

Open the maker portal on a real agent. Move through the left-hand nav top to bottom.

### 2a. Agent overview & instructions (1 min)
- **What it is:** the agent's identity card and system prompt.
- **Hard limit:** agent instructions cap at **8,000 chars** — and degrade earlier. Keep it lean; push specifics into tool/topic descriptions.
- **Gotcha:** curly braces `{ }` in instructions are evaluated as **Power Fx**. Don't paste JSON examples — use `key=value` or prose, or escape carefully.
- **Best practice:** treat the instruction field as the *router's* prompt, not the *answerer's* prompt. The work happens downstream in topics and tools.

### 2b. Topics (1.5 min)
- **What it is:** classic conversation flows + trigger phrases. Still routed by the generative orchestrator alongside tools.
- **Best practice:** review every **auto-generated topic description**. They're synthesised from trigger phrases and are the difference between routing and silence.
- **Gotcha:** the orchestrator is **non-deterministic**. Renaming or adding a topic can shift routing for *unrelated* topics. **Re-test the whole flow, not just the change.**

### 2c. Knowledge (2 min)
- **What it is:** SharePoint, public websites, Dataverse, uploaded files, enterprise systems.
- **Hard limit:** **500 uploaded files** per agent. Other source types have their own separate caps — *knowledge limits vary by source type*.
- **Soft limit:** past **~25 sources** (experience-based, not published) the orchestrator filters by *description* before searching. Vague names = your source never gets queried.
- **Platform ceiling vs reality:** uploads go up to **512 MB**, but only the first **~7 MB** of a SharePoint file is indexed — extra is **silently ignored** without an M365 Copilot license. No error, just no answers.
- **Gotcha:** retrieval is a **black box** — no control over chunking, query type, or reranking. Split large docs by topic *before* upload.
- **Best practice:** name and describe every source like you'd describe a tool. The orchestrator can't search what it doesn't pick.

### 2d. Tools / Actions — connectors, prompt tools, MCP (3 min) — **the heart of the session**
- **What it is:** everything the agent can *do*. Four flavours: **Connectors**, **Power Automate flows**, **Prompt tools**, **MCP servers**.

**Connectors — the moat**
- **1,000+ certified Power Platform connectors** — SAP, ServiceNow, Salesforce, Jira, Workday, every M365 service, Dataverse, on-prem via data gateway.
- Declarative tools — no SDK code, no auth plumbing, no hosting. **DLP, audit, certified auth come for free.** Custom connector (OpenAPI) when you need your own.
- *"In Foundry you'd be writing an SAP client. Here you tick a box."*

**Power Automate actions**
- **Gotcha:** flows run as **the maker**, not the end user. Approvals and audit reflect the maker identity.
- **Hard limit:** **100-second flow timeout**, **5 MB public / 450 KB GCC** payload. Put post-response work *after* "Return values to Copilot Studio".

**Prompt tools — foreshadow Session 2**
- LLM-as-a-tool. Instruction text lives in **Dataverse** (`msdyn_aiconfigurations.msdyn_customconfiguration`), not in YAML. *(In Session 2 we'll see why Apply Changes alone isn't enough.)*

**MCP**
- CPS consumes MCP servers as tool sources — the **direct bridge from Foundry**. Wrap a Foundry-hosted agent or tool as MCP, plug into CPS.
- **Transport:** CPS supports **Streamable HTTP**; SSE was **deprecated in August 2025**.

**Orchestrator capacity — call this out here, on the Tools screen:**

| Type | Limit | Behaviour |
|---|---|---|
| **Hard** | **128 tools** per agent (generative orchestration) | Enforced |
| **Soft** | **~25–30 tools** before routing quality degrades | **Silent** misrouting |
| **Per-tool** | `modelDescription` **1,024 chars** (hard) | Enforced |

- **Best practice:** write every `modelDescription` like a prompt to the orchestrator. *"Use this when the user asks about X. Don't use this for Y."*
- **Degradation symptoms:** misrouting, ignored instructions, unnecessary tool calls, wrong topic picked, dropped citations.

> **Anchor soundbite:** *"Architect to the soft limit. The orchestrator fails quietly before it fails loudly."*

### 2e. Generative AI settings & orchestration (1 min)
- **Generative orchestration toggle** — on for everything modern. Classic topic routing is the legacy path.
- **Content moderation** — Low / Medium / High. **Portal-only setting**; no YAML field exists.
- **Language support** for generative orchestration has expanded over time — **check current docs for your target locale** before committing to a non-English rollout.

### 2f. Test pane, Activity Map, Transcript (1 min)
- **Test pane = your only inner loop.** Use it after *every* change.
- **Activity Map** shows *which* tool/topic fired and why — read this, not just the chat bubbles.
- **Transcript view** surfaces hidden errors the Activity Map won't (e.g. `OpenAIMaxTokenLengthExceeded`). Train your eye to flip between the two.

### 2g. Channels & publishing (0.5 min)
- Teams, M365 Copilot, Direct Line, custom websites — **all configured in the portal**, not in code.
- Wire limits to keep in mind for channel choice: **262 KB Direct Line** payload, **28 KB ACS** (voice). These bite when you return large JSON blobs.

### 2h. Connected agents — the escape hatch (1 min)
- When you blow past ~25–30 tools or ~25 knowledge sources, split into **connected (child) agents**. Each child gets its own tool budget.
- **Caveats — explicitly call these out:**
  - No circular dependencies, no multi-level chaining.
  - **Citations are stripped on handoff** (child grounding doesn't propagate up).
  - **Child-agent MCP behaviour under parent orchestration can be inconsistent** — prefer attaching MCP at the parent and test delegation paths.
  - **Autonomous triggers only fire on the parent.**

---

## 3. Bridge to Session 2 + Q&A (2 min)
- "Everything we just clicked through — agents, topics, actions, prompt tools, knowledge — has a **YAML file** behind it. Next session we open VS Code and treat CPS like any other pro-code project: clone, edit, round-trip, push prompt tools, bridge MCP, ship via ALM."
- Q&A.

---

## Session 1 — soundbites

- *"Two limits: hard fails loudly, soft fails quietly. The soft one will kill your demo."*
- *"In Foundry you write the prompt. In CPS you write the **descriptions** — the orchestrator does the rest."*
- *"In cloned-agent workflows, prompt-tool instructions may need a separate Dataverse sync — they don't fully round-trip through YAML today."*
- *"Flows run as the maker. If you need user identity, use connector tools, not Power Automate."*
- *"Platform says 512 MB uploads. Reality says ≤ 5 MB if it ever touches a connector."*
- *"1,000+ connectors. That's the moat. In Foundry you'd be writing an SAP client; here you tick a box."*

## Session 1 — if asked
- **"Should I rebuild my Foundry agent in CPS?"** No — bridge via MCP or A2A. Use CPS for the M365 distribution layer.
- **"What about evals?"** CPS has agent test + traces; for rigorous evals keep Foundry's eval harness and point it at the CPS endpoint via Direct Line.
- **"Multi-agent — parent or connected?"** Internal single-team: child topics. Cross-team or scale-out past soft limits: connected agents (mind the caveats in §4).

---

# SESSION 2 — Pro-Code Path in VS Code

**Audience:** same Foundry devs, now with a laptop open. **Goal:** show CPS as a proper code workflow — clone, edit YAML, round-trip, push prompt tools, bridge MCP, run ALM.

## Agenda at a glance

| # | Section | Focus |
|---|---|---|
| 1 | Setup recap | Prerequisites, what's installed, what we're building |
| 2 | Anatomy of a cloned agent | YAML layout, what each folder is, what's NOT in YAML |
| 3 | The Apply / Get Changes round trip | Editing locally, pushing safely, pulling portal-side changes |
| 4 | Prompt tools — the Dataverse special case | Why YAML isn't enough; how to push the instruction text |
| 5 | Connectors & MCP in code | Wiring a Foundry tool into CPS via MCP, custom connectors |
| 6 | Agent Workbench tour | Spec → Build → Assess; how it disciplines Copilot |
| 7 | ALM & deployment | Solutions, pipelines, environments, source control |
| 8 | Demo + Q&A | End-to-end: clone, edit, round-trip, deploy |

## 1. Setup recap
- **Prerequisites:** Copilot Studio VS Code extension (pre-release), GitHub Copilot, a Power Platform environment with maker access.
- **Optional but recommended:** Dataverse MCP server, Agent Workbench extension.
- One-liner: *"If you can clone a repo and edit YAML, you can build CPS agents."*

## 2. Anatomy of a cloned agent
- Run **Copilot Studio: Clone Agent** → agent appears as a folder of YAML.
- Tour the layout: `agent.yml` (settings), `topics/` (conversation flows), `tools/` (actions, connectors, prompt tools, MCP), `knowledge/`, `.mcs/` (local schema cache).
- Call out what's **NOT in YAML**:
  - **Prompt-tool instruction text** (lives in `msdyn_aiconfigurations.msdyn_customconfiguration` in Dataverse)
  - **Connection references / auth values** (per-environment)
  - **Content moderation** (portal-only setting)
  - **Publishing config for channels** (portal step)

## 3. The Apply / Get Changes round trip
- **Apply Changes** = push local YAML edits to the portal.
- **Get Changes** = pull portal-side changes back into YAML.
- Demo the loop: edit a topic description → Apply → see in portal → make a portal-side tweak → Get Changes → diff in git.
- **Gotcha:** the LSP type-checks Power Fx against a local cache (`.mcs/botdefinition.json`) refreshed via `changetoken.txt`. Stale cache = false type errors. Fix: Get Changes to refresh.
- **Gotcha:** Apply Changes will not push prompt-tool *instruction* text — see §4.

## 4. Prompt tools — the Dataverse special case
- The YAML action defines **routing metadata only** (name, description, inputs, outputs).
- The executable **prompt text** lives in `msdyn_aiconfigurations.msdyn_customconfiguration` (JSON with segments + placeholders).
- To update prompt text from code:
  1. Parse the existing `msdyn_customconfiguration` JSON (preserve non-prompt keys and segment shape).
  2. Replace the prompt segment.
  3. PATCH back via Dataverse Web API.
- **Agent Workbench provides this** — `cps_parse_prompt_config` and `cps_build_prompt_update` MCP tools, plus `scripts/prompt-sync.mjs`.
- Demo: edit prompt-tool instruction in local file → run prompt-sync → verify in portal.

## 5. Connectors & MCP in code
- **Connector actions:** scaffold in portal (or paste known-good export pattern), edit locally. Preserve generated IDs and bindings.
- **Per-connection invoker identity:** how you get user-context auth without delegated Graph scopes — configure "Provided by run-only user" on each connection.
- **MCP tools:** point CPS at an MCP server. **CPS supports the Streamable HTTP transport; SSE transport was deprecated in August 2025.** This is the **direct bridge from Foundry**:
  - Wrap a Foundry-hosted agent or tool as MCP → consume in CPS as a tool.
  - Reuse Foundry's eval harness against the CPS endpoint via Direct Line.
- **Reminder from Session 1:** child-agent MCP behaviour under parent orchestration can be inconsistent — prefer attaching MCP at the parent and test delegation paths carefully.

## 6. Agent Workbench tour
- Three packages: core (shared), VS Code extension, MCP server.
- Workflow:
  1. **Initialise Project** — scaffolds folders, syncs knowledge, writes `copilot-instructions.md` (turns Copilot into a CPS specialist).
  2. **Create Plan** — generates `Requirements/spec.md` + `architecture.md` from requirements docs.
  3. **Build Agent** — performs safe artifacts; writes `build-checklist.md` for portal-only steps.
  4. **Assess Agent** — reviews routing, descriptions, prompts, YAML safety, constraints against best practices.
- Why it matters for Foundry devs: same "Copilot does the heavy lifting in VS Code" experience you already use for Foundry, applied to CPS.

## 7. ALM & deployment
- **Solutions** = Power Platform's deployment unit. Agents, topics, prompt tools, connection references all live in a solution.
- **Power Platform pipelines** for environment promotion (dev → test → prod).
- **Source control:** check the YAML folder into git. Standard PR workflow applies.
- **Per-environment values:** connection references, environment variables — never hard-code.
- **Gotcha:** prompt-tool text in Dataverse is not solution-aware the same way YAML is. Plan to re-run prompt-sync per environment.

## 8. End-to-end demo + Q&A
- Clone an agent → open in VS Code → add a topic → wire a connector → push a prompt-tool update → Apply Changes → test in portal → Get Changes → commit to git → deploy via pipeline.
- Q&A.

## Pro-dev gotchas to call out during the demo

- **Dataverse choice columns need integer values** (e.g. `100000000`), not text labels. Silent `FormatException` from MCP and connector actions otherwise — include the integer mapping in the action's `modelDescription`.
- **`create_table` via Dataverse MCP** can't set `precision`, `min`/`max`, or `precision` on decimals — column inherits default `0 → 1,000,000,000`. `update_table` is **add-only**; you cannot widen a column after the fact via MCP.
- **Knowledge retrieval is a black box** — zero control over chunking, query type (keyword/vector/hybrid), or reranking. Split big docs by topic before upload.
- **Citations cannot be passed as inputs to other tools.**
- **Cloud flow timeout = 100 seconds.** Put post-response work *after* "Return value(s) to Copilot Studio".
- **Connector payload limit = 5 MB public / 450 KB GCC.** Truncate large bodies in the flow before returning.
- **Curly braces `{ }` in agent instructions** are evaluated as Power Fx. Don't paste JSON examples — use `key=value` or prose.
- **Rate limits** are per-Dataverse-environment (RPM/RPH) and per-user-token. `OpenAIMaxTokenLengthExceeded` only visible in Transcript view, not Activity Map.

---

## Session 2 — soundbites

- *"Everything in the portal has a YAML file. Treat CPS like a repo, not a SaaS app."*
- *"Apply Changes pushes YAML. Prompt-sync pushes the brain. You need both."*
- *"MCP is the seam between Foundry and CPS. Build the agent where it makes sense; expose it everywhere."*
- *"Don't fight the portal — round-trip through it. The LSP cache will lie; Get Changes is your refresh."*

## Session 2 — if asked
- **"Can I write a CPS agent purely from code, no portal?"** Mostly no. Some artifacts (content moderation, channel publishing, initial prompt-tool creation) require the portal. Plan for a portal acceptance gate.
- **"Can I unit-test a topic?"** Use the agent test pane and Direct Line for scripted tests. There's no local runtime.
- **"How do I diff prompt-tool changes in PR?"** Keep prompt instruction text in a synced local file (Agent Workbench does this); diff the file, not the Dataverse JSON.
- **"Can multiple devs work on the same agent?"** Yes via git on the YAML, but coordinate Apply Changes — last writer wins in the portal.
