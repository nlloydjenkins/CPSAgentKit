# Modern Agents (Modern Copilot Studio)

"Modern agents" is the name for the new generation of agents in Copilot Studio. They replace the classic orchestration model with a continuous reasoning loop, instruction-first authoring, and reusable skills. This file captures the architecture, building blocks, migration approach, and how modern agents relate to Workflows.

Source: *Copilot Studio — Technical Deep Dive* (Copilot Acceleration Team); *Meet the new Copilot Studio* (techcommunity.microsoft.com); *What's new in Copilot Studio, May 2026* (microsoft.com).

---

## Agents vs Workflows: The Two Build Surfaces

Copilot Studio has two ways to build AI workloads. They are not an either-or choice — enterprise solutions combine both, and each can call the other.

- **Agents** — mostly *adaptive*. Reason over context and decide the next step at runtime, where the path cannot be mapped up front. They call deterministic steps when a part of the work is fixed.
- **Workflows** — mostly *deterministic*. Run a defined sequence the same way every time, where the process is predictable and repeatable. They call agents when a part of the work needs reasoning.

The design question is: **which part of a process should carry the load deterministically, and which should reason adaptively** — and how to combine the two. Workflows can call agents; agents can call workflows. The decision relies on what percentage of the process is known before runtime.

---

## Classic vs Modern Orchestration

### Modern orchestrator: continuous Thought → Action → Observe → Decide

The new orchestrator keeps deciding from the latest state on every loop:

1. **Thought** — reason over the latest state.
2. **Action** — call a tool or topic.
3. **Observe** — read the tool result.
4. **Decide** — choose the next step live.

Best fit: broad problem spaces that cannot be fully mapped upfront (e.g. querying a complex data model with many unknown fields). The new orchestrator shows **~20% higher evaluation accuracy with ~50% fewer tokens** than classic.

### Classic orchestrator: plan → execute (mainline)

Classic builds an explicit plan object, then runs it:

1. **Intent** — understand the request.
2. **Plan** — synthesize a multi-step workflow.
3. **Execute** — run authored steps (collect inputs, execute action, summarize response).

Less live replanning, easier to inspect, but rigid: a detour or error breaks the plan.

---

## Why Move From Classic Orchestration to Modern Agents

Modern agents complete real tasks the way a person would, closing gaps where classic orchestration fails:

- **Asking fewer, smarter questions** — classic pops a rigid prompt for every tool input in a fixed order. Modern agents infer answers from what is already known, ask only what is missing, and can bundle several questions at once or reorder them.
- **Handling detours** — in classic, a side question or mid-task change of direction terminates the plan (often with an inexplicable error). Modern agents let the user ask questions or switch context, then pick the task back up.
- **Orchestrating over tools** — better tool selection accuracy, chaining one tool's output into the next, and running independent tools in parallel for faster completion.
- **Following instructions (instruction-first)** — classic forces bottom-up building from tool descriptions. Modern agents are instruction-first: write reusable skills in markdown (or import existing GitHub Copilot / Claude Code skills) and expect them to just work.
- **Recovering from errors** — when a tool call fails, classic stops and surfaces the error. Modern agents may retry intelligently or take an alternative path to still finish the task.
- **Flowing across turns** — instead of rigid plan-then-execute, modern agents interleave questions, tool calls, and responses fluidly across turns.

---

## Building Blocks of Modern Agents

Separate concerns: behavior, facts, actions, memory, code, procedures, and delegation. **Design rule: choose the smallest component that makes the behavior reliable, inspectable, and safe inside the loop.**

| Component | Purpose | Notes |
| --- | --- | --- |
| **Instructions** | Role, tone, what not to say; how the agent drives conversation flow | Loads on *every* turn — keep lean |
| **Knowledge** | Searchable docs, sites, files | Grounds answers |
| **Tools / MCP servers** | Live lookups, APIs, MCP servers, CRUD | Act on systems |
| **Memory** | Persistent context across sessions | User preferences and history |
| **Code Interpreter** | Generate code on demand, data manipulation, file analysis/generation | Runs in a sandboxed container |
| **Skills** | Instructions the agent loads on demand, plus bundled resources (`SKILL.md`) | Keeps top-level instructions lean; optimal for unique procedures |
| **Skill supporting files** | Resources bundled with the skill (a zip), e.g. scripts | Loaded on demand when needed |
| **Connected agents** | Delegate specialized scope only if needed; own instructions/tools/skills/knowledge | Useful for large sub-domains; splitting out *small* tasks does **not** improve accuracy |

---

## Instructions: Shape Behavior, Stay Lean

Modern agents are highly adherent to their instructions, so they reliably do what you write down. But adherent does not mean instructions must encompass everything — they do not have to spell out every situation up front.

**Use instructions to tell the agent how to behave:**

- **Guide tool use** when descriptions are not enough to tell which tool, which parameters, or what to check first.
- **Fill in what it cannot infer** from common sense: your org's conventions, rules, and context the model has no way to know.
- **Set tone & voice** and shape response formatting.
- **Shape the conversational flow** by directing the agent to ask the right questions at the right points.

**Keep them lean.** Everything you keep loads on every single turn. Lean instructions stay predictable and leave room for the conversation. Move everything *situational* (things that only matter sometimes) out into a Skill.

> Instructions = what is true in *every* conversation. If it only matters sometimes, it belongs in a Skill.

---

## Skills: Instructions On Demand

A Skill is just instructions and resources, loaded on demand. Metadata (name + description) sits in context by default; full content loads only when a scenario matches.

**Skill anatomy:**

- `SKILL.md` — `name` + `description` are routing metadata; skill instructions are the core.
- **Examples** — show, don't tell (few-shot examples of correct output).
- **Resources** — files, templates.
- **Scripts** — bundled executable code (e.g. `.py`) that runs the data work at runtime.

**Why use a Skill:**

- **Maintainability** — keep the agent readable, one focused Skill at a time.
- **Efficient context use** — instructions load only when the scenario needs them, not every turn.
- **Accuracy (in some cases)** — a large always-on prompt makes the model weigh irrelevant guidance every turn, reducing accuracy. A Skill loads only what the task needs.

**Avoid:**

- **Vague descriptions** — weak routing signals make a Skill mis-fire or never trigger.
- **Mega-skills** — broad do-everything scope blurs intent and overlaps others.
- **Fact dumps** — a Skill guides; it does not replace a Knowledge source.
- **Unreviewed Skills** — treat AI or community Skills as untrusted code; review first.

Keep each Skill scenario-specific, name it precisely, and test that it fires.

---

## Mapping Classic Capabilities to Modern Agents

Most authoring and conversation logic maps onto instructions, skills, and tools. A few cases need a workaround or are on the roadmap.

| What you want to do | In classic agents | In modern agents |
| --- | --- | --- |
| Drive the conversational flow | Authored topics + LLM-generated questions, one tool input at a time | Agent-level instructions and reusable skills; the agent decides what to ask and when |
| Transform data | Inline Power Fx formulas | Code Interpreter or helper code in a tool/skill (Python — less low-code friendly than Power Fx); or delegate to a Workflow |
| Use known context about the user (department, role, channel) | System / environment variables load user context deterministically | No system variables; instruct the agent to call a tool that fetches context before responding |
| Intercept user messages / agent responses | System topics and triggers (On message received, On AI response generated) | **No general intercept point yet** — hooks are planned |
| Display UI components | Adaptive Cards render a deterministic card | **Gap** — work ongoing to identify a rich UI component framework |
| Capture user input via UI components | Adaptive Cards with input fields | **Gap** — same rich UI component work |
| Measure | Analytics dashboards for builders | Work ongoing to enable both experiences |
| Restrict to grounded knowledge only | Toggle to disable general/LLM knowledge | **By design not offered** — modern agents have autonomy to decide when to generate or ask |
| Recover when a tool call fails | "Raise an Error" halts the topic → On Error system topic (message only); "Continue on error" skips silently | Agent reads the error, reasons about an alternative, and continues without stopping |
| Read files and run real computation | Code Interpreter (preview): sandboxed, one file per prompt, no multi-turn, no network, timeouts, charts don't render in Teams/M365, off by default | Full Python runtime in an isolated container — no single-file limit, multi-turn, on by default, install any package, no network restrictions, charts render everywhere |
| Package a complete multi-step task | All logic in a single 8,000-char instruction block; one tool per turn, no memory of a wider plan | A **Skill** packages the whole process as an importable unit: `SKILL.md` plan + hard no-call constraints + few-shot examples + bundled scripts. Base instructions stay lean; orchestrator loads the skill on demand, shared across agents |

**UI components are the main true gap.** Most other needs have a workaround or are on the roadmap.

---

## Migration: Do Not Port — Re-Architect

Translate authored behavior into components that work inside the modern agent loop. **Migrate capabilities, not components.** Ask: *what tasks must the agent accomplish?* — then translate what the agent must do into loop-ready components rather than copying building blocks one-for-one.

### Construct mapping

| Classic construct | Modern target | Rationale |
| --- | --- | --- |
| **Topics** (authored conversational paths) | **Skills** (reusable context injected when needed) — plus a **Tool** when the topic mainly performs one action/lookup/deterministic function | Topics drive flow; reusable procedures become skills |
| **Power Fx** (inline deterministic logic) | **Tool / skill helper code** | Move deterministic data-manipulation formulas into explicit code, referenced in instructions or a skill support file |
| **Variables** (stored state) | **Conversation history / memory / Dataverse** | Short-lived context stays in the loop; durable task context → Dataverse; user context → memory; derived values → Code Interpreter |
| **Child Agents** (specialized delegated expertise) | **Connected Agents** | Unchanged concept |
| **Adaptive Cards** | Common, unchanged building block (still available) | — |
| **Agent Flows** (automated deterministic steps) | **Workflows** (automation with native AI actions and agent handoffs) | Move prompts into inline agents |
| **Fallback topic** | **Instructions + knowledge + evals** | Define fallback behavior, grounding strategy, and tests for unresolved intents |
| Hooks | **Hooks (soon)** — trigger experience for code-first workflows | Roadmap |

Knowledge, Tools, Code Interpreter, and Connected Agents are common, largely **unchanged** building blocks.

> The target component is a **design decision**. Split old artifacts when one construct actually contains multiple jobs.

### Migration workflow

Take stock, then loop on refactoring until it meets its evals. **The migration is done when the agent can perform its core tasks — not when every old artifact has been mechanically copied.**

1. **Understand the use case** — assigned tasks, outcomes to deliver, evals for what it must do, boundaries and risks, edge-case handling.
2. **Inventory the existing agent** — its topics, flows, variables, and *why* each design choice was made.
3. **Refactor and rebuild** — map assigned *tasks* (not components) into loop-native blocks; drop what is no longer needed.
4. **Evaluate and compare** — run the evals as a benchmark; compare old vs new on the core journeys.

Loop steps 3–4 until evals pass.

> **CAT migration plugin:** The Copilot Acceleration Team (CAT) provides a Copilot Studio Plugin for GitHub Copilot / Claude Code that clones your agent locally, inspects it, and computes a target architecture using Microsoft best practices — letting you fine-tune a pre-computed agent instead of rebuilding from scratch (claimed ~15x faster migration).

---

## Choosing Where to Build: Predictability vs Agility

Choosing the right foundation relies first on a good understanding of the process being transformed.

- **Workflows suit processes where start and end points are known**, with variability happening at the *step* level. AI capabilities are embedded where a step needs reasoning or judgment.
  - Example: *Expense Approval* — new entries may lead to a fast path or a policy check.
- **Agents suit broad problem spaces** that cannot be fully mapped upfront. The orchestrator reasons over a loop and calls well-structured, repeatable steps (flows, code) for deterministic actions.
  - Example: *Healthcare Intake* — advisory results from a multi-turn patient dialogue.

### Goal-first vs agent-first mindset

The shift from "agent by default, reasoning everywhere" (yesterday) to "you choose where AI earns its place" (today):

| Question | Agent-first (yesterday) | Goal-first (today) |
| --- | --- | --- |
| Needs AI at all? | Reasoning everywhere | You choose where AI earns its place |
| Who decides the steps? | Orchestrator works it out at runtime | You author the path yourself |
| A step needs judgment? | Whole process is one agent | Add reasoning on just that step |
| A step needs a tool? | Hand the tool to the agent; it decides when | You place the agent/tool on the step that needs it |
| Which model runs it? | One model covers the hardest step | Each step picks the model that fits |

The control spectrum runs from **deterministic classic automation** → **agentic workflow (controllable middle)** → **autonomous agent decides all (full autonomy)**.

---

## Workflows: Deterministic Reliability + Agent Reasoning

Workflows keep the structure of agent flows and add the intelligence of agents — without the unpredictability. They keep deterministic reliability and bring in agent-node reasoning (or human review) only where judgment is needed.

**Why move from autonomous agents & agent flows to Workflows:**

- **Reasoning in the flow** — when a decision is too ambiguous for fixed logic, an agent node (or human review node) resolves it in place and hands back a structured result the flow can branch on.
- **Same result every time** — deterministic: same input, same path, same result. Reliable enough to trust in production (autonomous agents drift).
- **You decide what's allowed** — you decide by design which calls an agent node gets to make, and gate anything risky behind a human approval node.
- **Caught in tests** — test any node on its own and run full workflow evals; regressions show up in tests, not in front of a customer.
- **Cost you can forecast** — a fixed, countable set of steps, with variable cost only on the agent nodes you place.
- **One canvas** — the new Workflows designer builds the whole process on one canvas: inline configuration, simpler building blocks, native AI actions.

### Building blocks of a Workflow

- **Triggers** — Schedule, Connector event, HTTP request, Manual.
- **AI nodes** — Classification, Inline Agents, Published Agents, M365 Copilot (1P agents, DAs), Prompts, Document Extract (planned).
- **Functions** — Data Operations, Time Operations, HTTP Requests.
- **Flow control** — If/Else Conditions, Switch, Loop, Scope, Terminate.
- **Context & data handling** — Variables, Dynamic Content, Power Fx Expressions, Computer-Using Agents (planned).
- **Connectors** — Prebuilt, Custom.
- **Human input** — Human Review Request, AI Human Assistance, Approvals, Adaptive Cards.
- **Custom logic** — Code Execution (planned).

### Mapping classic agent flows to modern workflows

| What you want to do | In classic agent flows | In modern workflows |
| --- | --- | --- |
| Add AI reasoning at a specific step | Call an existing *published* agent via "Add an agent" (built/published separately first; no inline agents, no M365 agent support) | **Agent nodes** call a published agent *or* build a new **inline agent** in the node — instructions, tools, knowledge without leaving the canvas. M365 agents supported |
| Test a single step | No node-level testing — run the whole flow every time | **Test node-by-node** on the canvas before publishing |
| Pause for human input mid-process | Impossible synchronously (hard 100-second timeout) | Native **human-in-the-loop node** pauses and waits; resumes only when the human responds |
| Run evaluations | No automated evaluation — manual, one conversation at a time | Run test sets of up to **20 cases** (import or AI-generated); multi-turn eval, activity maps, compare runs over time, export CSV, share read-only via Analytics Viewer role |

### Choose the right level of intelligence per step

AI usage in a workflow step can go from none → lightweight (LLM-powered) → orchestration at runtime. Choose the right level **per step, no less, no more** — it is a question of context, cost, and time optimization.

- **Deterministic step** — transform, calculate, look-up, request, route. Use when input-to-output is known and logic is cheap to code (low-maintenance). Examples: Data Operation, Condition, Loop, Scope, HTTP Request, Function, Connector.
- **AI-powered step** — reason, interpret, understand, orchestrate tools. Use when a step needs reasoning that cannot be expressed as a rule, rules are too complex/costly to maintain, or the action path is ambiguous and requires tool orchestration. Examples: Classification, Prompts, Published Agents (1P or custom), Inline Agents.

---

## Inline Agents vs Referenced Agents (in Workflows)

Workflows can spin up an agent inside a single step. The design choice is whether to keep agent capabilities *in flow* or as a *standalone* asset.

| | **Inline agents** | **Referenced (published) agents** |
| --- | --- | --- |
| Shape | An action inside a workflow (Agents connector) | A published CPS agent (Agents connector); a 1P Copilot agent or Declarative Agent (M365 Copilot connector) |
| Starts with | A workflow calls it from an Agent node | A user conversation in a channel, **or** a workflow calling it from an Agent node |
| Lives in | A flow object | An agent object |
| Building blocks | Modern agent components: Instructions, Knowledge, Tools/MCP, Code Interpreter. **Skills not included yet** (roadmap) | Custom agents (modern or classic components); DAs in Agent Builder (Knowledge, Copilot connectors, Work IQ) |
| Use when | The agent serves a single process step; portability/reuse not needed; human input only disambiguates; lightweight (a prompt, or slightly extended with tools) | Functionality is reusable across processes; a human may need it on-demand; benefits from multi-agent orchestration; specialized agents already exist (Researcher, Analyst) |

**Rule of thumb:** use inline agents for custom AI needs in a flow step; standalone agents for reusable custom AI; M365 nodes when the task suits specialized Copilot agents.

---

## Human-in-the-Loop (HITL)

Calibrated human gates place oversight mid-run where it is truly needed. Balance autonomy and control.

**Two ways to invoke HITL:**

- **HITL by design** — the workflow maker decides. Built-in actions:
  - **Human Request for Information** — structured inputs: Text, Choices, Number, Yes/No, Date, Email.
  - **Approvals** — Approve/Reject, option sets, via the Microsoft Teams approval hub.
  - **Customizable Input** — post an Adaptive Card and wait; rich interactive JSON payload.
  - **Send email with options** — list of choices via the Outlook 365 pre-built connector.
- **HITL by judgment** — the agent decides. *Request assistance* inside agent nodes: the agent reasons and requests human assistance when unsure.

**Mechanics:** hit decision point → notify human → pause execution and wait → human replies → collect input and resume.

**Common scenarios where HITL fits:**

- A decision is irreversible and costly (e.g. data deletion).
- A human sign-off is required (e.g. a large expense approval).
- Decisions under ambiguity or conflict (e.g. finding best meeting times).
- The four-eyes principle applies (e.g. a pull request review).

**Custom HITL experience:** to scale beyond built-in options, webhook actions provide a customizable solution.

---

## Quick Reference

- **Classic = plan → execute. Modern = Thought → Action → Observe → Decide (continuous).**
- **Instruction-first, not tool-first.** Write reusable skills in markdown.
- **Instructions = always-true behavior. Skills = situational, loaded on demand.**
- **Migrate capabilities, not components.** Done when core tasks pass evals, not when every artifact is copied.
- **Agents for unmapped problem spaces; Workflows for known start/end with step-level variability.**
- **Pick AI intelligence per step:** deterministic where cheap, AI-powered where reasoning is required.
- **Inline agents** for single-step custom AI; **referenced agents** for reusable AI.
- **Main current gap:** rich UI components (Adaptive Card equivalents). System variables and message intercept hooks are also gaps (hooks planned).
