# Copilot Studio Best Practices
## A Practical Guide for Builders

---

# Agenda

1. **Getting Started**
2. **Agent Design**
3. **Topics**
4. **Tools & Connectors**
5. **Multi-Agent Patterns**
6. **ALM & Governance**
7. **Gotchas & Anti-Patterns**

---

# Part 1: Getting Started

---

# What is Copilot Studio?

- Low-code platform for building AI agents on the Power Platform
- Agents can answer questions, perform actions, and orchestrate workflows
- Publishes to Teams, web, M365 Copilot, and other channels
- Two orchestration modes: **Classic** (rule-based) and **Generative** (AI-planned)

---

# Key Limits to Know Before You Build

| Limit | Value | Why It Matters |
|---|---|---|
| Instructions field | 8,000 characters | Approx. 1,500 words for your most important config |
| Tools per agent (practical) | 25–30 | Routing degrades beyond this |
| Topics per agent | 1,000 | 250 in Teams environments |
| Connector payload | 5 MB (public) / 450 KB (GCC) | GCC is dramatically lower |
| File knowledge sources | 500 files max | Does not apply to SharePoint |
| SharePoint file size (no M365 Copilot licence) | 7 MB | Files over 7 MB are **silently ignored** |

---

# Rate Limits

- **Trial/dev environments:** 10 requests per minute
- **Production (pay-as-you-go):** 100 RPM / 2,000 RPH
- No graceful degradation; the agent stops responding when limits are hit
- 5–10 daily active users can trigger limits on lower tiers

Check your billing tier before committing to SLAs

---

# Generative vs Classic Orchestration

| | Classic | Generative |
|---|---|---|
| **How it routes** | Trigger phrases | AI reads descriptions |
| **Actions** | Called explicitly from topics | Invoked dynamically by the planner |
| **Knowledge** | Fallback only | Proactively queried |
| **Best for** | High-compliance, predictable flows | Flexible, multi-intent conversations |
| **Language** | Any | **English only** (orchestration layer) |

Start with generative unless you have a specific reason for classic. You can always add deterministic topics for critical paths.

---

# Part 2: Agent Design

---

# Writing Effective Instructions

**What to include:**
- Role and persona ("You are an IT support agent for Contoso")
- Response format preferences (lists, tables, concise vs detailed)
- Scope boundaries ("Do NOT answer questions about competitor products")
- Tool usage rules ("Always use `CheckOrderStatus` for order queries")

**What to avoid:**
- Too vague: "Help users with their questions"
- Too restrictive: scripting every response defeats the purpose
- Contradictory rules: "always be brief" + "provide detailed explanations"
- Referencing tools that aren't connected

---

# The T-C-R Framework for Instructions

| | |
|---|---|
| **Task** | What the agent should accomplish |
| **Context** | What information and constraints apply |
| **Requirements** | What format, tone, and boundaries must be met |

```
## Task
You are an IT Help Desk agent for Contoso. You help employees 
resolve technical issues and answer IT policy questions.

## Context  
You have access to the IT Knowledge Base and can create 
support tickets via the CreateTicket tool.

## Requirements
- Always verify the employee's department before creating tickets
- Use bullet points for step-by-step instructions
- Escalate security-related issues immediately
```

---

# Three Control Layers

Every production agent should implement these:

| Layer | When to Use | Example |
|---|---|---|
| **Deterministic** | Irreversible actions, compliance-critical | Payment processing, record deletion |
| **Hybrid (Intercept)** | Medium-risk, needs oversight | Approval workflows, value-limit gates |
| **AI Orchestrator** | Low-risk, flexible | Q&A, information lookups, multi-step research |

If it cannot be undone, do not let the AI decide alone

---

# Part 3: Topics

---

# When to Use Topics

**Use topics for:**
- Deterministic processes with fixed steps
- Structured data collection (forms, intake flows)
- Compliance-critical paths that must be reproducible
- Actions that need explicit user confirmation

**Don't use topics for:**
- Simple Q&A that knowledge sources can handle
- One-off lookups the orchestrator can route to a tool

---

# Designing Topics for Generative Orchestration

| Aspect | Classic | Generative |
|---|---|---|
| **Trigger** | 5–10 trigger phrases | Clear natural language description |
| **Naming** | Anything works | Active, descriptive: `ResetPassword` not `Flow1` |
| **Inputs** | Question nodes | Auto-prompted from input names |
| **Outputs** | Direct messages | Return output variables for the orchestrator |

Descriptions are the primary routing mechanism. They matter more than instructions for topic selection.

---

# Topic Design Tips

- **One topic = one intent.** Don't bundle "check order" and "cancel order" in one topic
- **Avoid overlapping descriptions.** If two topics sound similar, the agent invokes both
- **Use output variables** instead of sending messages directly; let the orchestrator compose the final response
- **Define clear input parameters** with descriptions for auto-prompting

```
Topic: ResetPassword
Description: "Resets a user's Active Directory password when they 
report being locked out or having forgotten their password"
Input: username (string) - "The employee's network username"
Output: resetResult - "Confirmation message with temporary password"
```

---

# Part 4: Tools & Connectors

---

# Tool Design Principles

1. **Single purpose.** Each tool does one thing well
2. **Deterministic.** Same inputs → same outputs. Non-deterministic tools confuse the planner
3. **Names matter more than descriptions.** Use `TranslateText`, not `Action_3`
4. **Curate aggressively.** Fewer high-quality tools > many overlapping tools
5. **Every input needs a description.** Missing descriptions cause the orchestrator to prompt the user unnecessarily

---

# Connector Action Input Configuration

For autonomous agents (no user to prompt), input configuration is critical:

- **Every dynamic input needs a description.** Without one, the orchestrator prompts the user even when it has the value
- **State the value source:** "from the trigger context", "from step 3 output", not just the format
- **Lock down system fields:** Import Sequence Number, Time Zone Rule, UTC Conversion. Set to custom values or remove
- **Primary keys:** Set to `GUID()` for Dataverse "Add a new row" actions
- **Choice columns:** Include integer mappings in the input description, not just instructions

---

# Custom Connector vs MCP Server

| Factor | Custom Connector | MCP Server |
|---|---|---|
| **Best for** | Power Platform-native APIs, SharePoint, Dataverse | External SaaS APIs, cross-platform tool sharing |
| **DLP** | Full enforcement | Allow/deny tool controls only |
| **ALM** | Included in solutions | Must be deployed separately |
| **Multi-platform** | Power Platform only | Any MCP-aware client |
| **Local dev** | Cloud only | Stdio transport for local testing |

If it is in the connector ecosystem or needs DLP, use a Custom Connector. If it is external or shared across platforms, use an MCP Server.

---

# Power Automate Flows as Actions

- **Flows run as the maker by default,** not the end user
- **100-second timeout.** If the flow takes longer, the agent receives no output
- Put long-running logic **after** the "Return value(s) to Copilot Studio" step
- Use a **dedicated service account** for production flows, not a personal maker account
- If the maker leaves the org, all flows using their credentials **break silently**

---

# Part 5: Multi-Agent Patterns

---

# When to Go Multi-Agent

**Use multi-agent when:**
- Different business domains need separate knowledge and tools (HR, IT, Finance)
- Different teams need to maintain agents independently
- A single agent exceeds 25–30 tools or 8,000 chars of instructions

**Don't use multi-agent when:**
- A single well-designed agent covers the use case
- You need shared MCP tools across agents
- You need deterministic routing

---

# The MCP Limitation You Must Know

> **Child agents CANNOT invoke their own MCP servers.**

MCP tool invocation fails when the server is attached to a child agent. All MCP calls must go through the parent agent.

**Impact:** You cannot give each child agent its own external tools via MCP. The parent must own all external integrations. This fundamentally limits the specialisation model.

**Workaround:** Configure all MCP tools on the parent and use child agents only for conversation logic and knowledge retrieval.

---

# Context Passing Between Agents

- The orchestrator passes context when delegating to child agents
- Connected agent responses are always summarised. Citations and links are stripped
- 10-turn conversation history limit. Store critical state in variables
- Test interaction flows thoroughly; receiving agents can return incomplete responses

Instruct the parent to preserve child output as a labelled block rather than paraphrasing

---

# Part 6: ALM & Governance

---

# ALM: Current State

| Problem | Impact |
|---|---|
| Managed solutions produce vague SQL errors | Knowledge/connection references don't transfer cleanly |
| Deleted knowledge sources persist in the API | Ghost references cause import failures |
| No version diffing or rollback | Can't compare versions or undo a bad publish |
| Knowledge sources don't process on import | Must manually re-add in every target environment |

---

# ALM: Recommendations

1. **Work inside Solutions from day one**
2. **Separate environments** for Dev, Test, Prod with distinct DLP policies
3. **Document agent configuration manually.** Keep a changelog outside the platform
4. **Test knowledge sources after every import.** Do not assume they transferred
5. **Use deployment pipelines** (in-product or Azure DevOps / GitHub)

Include knowledge source re-processing in your deployment runbook

---

# Authentication Identity Model

Choose early. Changing later means reworking topics, connectors, and security roles:

| Identity | When to Use | Channel Requirement |
|---|---|---|
| **End user (delegated)** | Actions need user attribution, per-user data access | Teams, authenticated webchat, M365 Copilot |
| **Service account** | Background processing, autonomous agents, system integrations | Any channel |
| **Mixed** | Flow connections independently run as user or maker | Depends on each connection |

SharePoint does not support service principals. Knowledge grounding requires user authentication.

---

# Data Loss Prevention (DLP)

DLP became **mandatory** for all tenants in early 2025.

**What you can control:**
- Block "No authentication" agents
- Block specific knowledge source types (SharePoint, public websites)
- Block specific connectors as tools
- Block HTTP requests
- Block publishing channels (Teams, Direct Line, Facebook)
- Control event triggers for autonomous agents

If no channels are unblocked, agents cannot be published

---

# Part 7: Gotchas & Anti-Patterns

---

# Silent Failures

| Failure | What Happens |
|---|---|
| SharePoint files > 7 MB (no M365 Copilot licence) | Silently ignored. No error, no answers |
| Sensitivity-labelled documents | Show "Ready" but never provide responses |
| Knowledge "Ready" status | Shows Ready, then In Progress, then Ready. First "Ready" is false |
| ACS channel 28 KB limit | Variables silently dropped on handoff |
| Deleted knowledge sources | Removed from UI but persist in the API |

---

# Generative Orchestration Gotchas

- **Instructions are guidance, not hard rules.** The agent can and will deviate if the LLM reasons differently. Enforce critical constraints through topic logic, not instructions alone.
- **"Do not" is weaker than "always".** "Always redirect pricing to sales" works better than "Do not answer pricing questions"
- **Long instructions dilute important rules.** Front-load your most critical constraints
- **Same query, different results** depending on conversation context. Test in realistic scenarios
- **Overlapping topic descriptions = double invocation.** Test and narrow descriptions

---

# Content Filtering

When a response is blocked: no logging, no reason code, no detail. You cannot tune or override the built-in filter. If legitimate content triggers it (medical, legal, security), your only option is a support ticket.

---

# Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Do This Instead |
|---|---|---|
| Dumping every SharePoint site as knowledge | Poor retrieval, irrelevant answers | Curate. Only add sources that answer real user questions |
| Using Excel/spreadsheets as knowledge | Agents can't run code for analysis | Use connectors for analytical data |
| 50+ tools on one agent | Routing degrades, latency increases | Split into connected agents at 25–30 tools |
| No auth on production agents | Anyone with a link can chat | Use DLP to block "No authentication" |
| Testing only in the test panel | Test panel uses maker credentials | Test in the target channel with real user credentials |
| Ignoring knowledge re-processing after import | Answers stop working in target environment | Build re-processing into your deployment runbook |

---

# Enterprise Design Rules of Thumb

1. **Agentic first, procedural only when necessary**
2. **One agent = one domain** (25–30 tool max)
3. **Topics for control, generative for flexibility**
4. **Knowledge for reference, connectors for transactions**
5. **Start with the narrowest scope.** Expand only when testing proves you need more
6. **Name everything for the model.** If it is unclear to a human, it is unclear to the AI
7. **Every write action needs confirmation**
8. **DLP and ALM from day one**
9. **Re-evaluate after every model upgrade**

---

# Key Takeaways

- **Instructions are your primary lever.** Get the 8,000 characters right before anything else
- **Know your limits.** Rate limits, tool counts, and file sizes before committing to features
- **Silent failures are common.** Test thoroughly and do not trust "Ready" status
- **ALM requires discipline.** Work in solutions from day one and document everything
- **Start small.** Fewer tools, tighter scope, expand based on testing
- **Test in the real channel.** The test panel does not equal production

---

# Resources

- [CPSAgentKit MCP Server](https://www.npmjs.com/package/@cpsagentkit/mcp-server): `npx @cpsagentkit/mcp-server` for AI-assisted CPS guidance
- [CPSAgentKit VS Code Extension](https://github.com/nlloydjenkins/CPSAgentKit): scaffolding, assessment, and knowledge sync
- [Microsoft Copilot Studio Documentation](https://learn.microsoft.com/en-us/microsoft-copilot-studio/)
- [Power Platform Admin Center](https://admin.powerplatform.microsoft.com/)

---

# Questions?
