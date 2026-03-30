# Copilot Studio Assessment Guide — Part 3: Agent Design (Instructions, Knowledge & Orchestration)

How to configure agents that behave predictably and answer accurately.

---

## Capability Quick Reference

Use this table to decide which Copilot Studio capability to reach for first.

| Capability                        | When to Use                                                                                                               | When NOT to Use                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Topic**                         | Deterministic process, structured data collection, compliance-critical flow, known intent with fixed steps                | Simple Q&A that knowledge can answer; one-off lookups                      |
| **Agent (standalone)**            | Self-contained domain (e.g. IT Help Desk), independent lifecycle, separate channel or audience                            | Cross-domain orchestration that requires shared context                    |
| **Child / Sub-Agent**             | Reusable skill (e.g. address lookup), shared across multiple parent agents                                                | One-off logic used by a single parent — use a topic instead                |
| **Connected Agent (multi-agent)** | Peer-level collaboration, each agent owned by a different team, loose coupling                                            | Tightly coupled sequential workflows — use topics or a single orchestrator |
| **Tool (connector action)**       | Real-time data retrieval, CRUD operations, API integration                                                                | Static reference content — use a Knowledge Source                          |
| **Power Automate Flow**           | Complex multi-step orchestration, approval workflows, cross-system transactions, operations beyond connector capabilities | Simple single-API calls — use a connector action directly                  |
| **Knowledge Source**              | Static or semi-static reference content (policies, FAQs, product docs)                                                    | Real-time transactional data, per-user filtered records — use a Connector  |

---

## Agentic-First Design Philosophy

When architecting solutions, prefer agentic patterns over procedural ones. The goal is to maximise the orchestrator's autonomy and minimise rigid, hand-coded control flow.

**Preference hierarchy (reach for higher items first):**

1. **Tools (connector actions, HTTP actions)** — Let the orchestrator call APIs directly. Smallest unit of work, easiest to compose, easiest to test.
2. **MCP Servers** — For external APIs, cross-platform tool sharing, and scenarios outside the Power Platform connector ecosystem. Centralised, reusable, governed.
3. **Child / Connected Agents** — Delegate entire domains to specialist agents rather than building monolithic topic trees.
4. **Prompt-driven instructions** — Shape behaviour through the agent's instructions and tool/topic descriptions. Let the LLM planner reason about what to do, rather than scripting every path.
5. **Topics** — Reserve for deterministic checkpoints: compliance gates, irreversible actions, structured data collection where the model must not improvise.
6. **Power Automate Flows** — Use only when the operation genuinely requires multi-step orchestration, approval workflows, or cross-system transactions that exceed what a single connector action can do. Flows run as the author by default, add latency (100s timeout), and are harder to version.

**Why agentic-first?**

- Tools and MCP servers compose naturally under generative orchestration — the planner can chain them without pre-authored flow logic
- Child agents enable team-owned, independently versioned domains
- Prompt-driven design reduces topic sprawl and maintenance overhead
- Fewer topics and flows = smaller solution footprint, simpler ALM, fewer silent deployment failures

**When to drop down to procedural patterns:**

- The action is irreversible (payment, deletion, security change) — use a deterministic topic with confirmation
- Regulatory audit requires exact, reproducible conversation paths — use a scripted topic
- The workflow genuinely needs multi-step orchestration with branching and approvals — use a Power Automate flow
- The connector action alone cannot achieve the outcome (e.g. needs a loop, conditional retry, or parallel fan-out)

---

## Instructions: The Most Important 8,000 Characters You'll Write

The instructions field is the single most influential configuration for agent behaviour. Everything else — knowledge, topics, tools — is secondary to getting this right.

### Structure and Formatting

- **Use Markdown in the instruction field.** Copilot Studio supports it, and it helps the AI parse your intent. Use `#` headings to label sections (Objective, Steps, Guidelines), bullet points for unordered rules, numbered lists for sequences.
- **Use backticks** to denote tool or system names (e.g. `CRM Database`, `SalesReport`) so they stand out.
- **Bold critical keywords** or whole lines for extremely important rules (e.g. "**Always verify customer identity before proceeding**").
- **Keep different topics in separate paragraphs.** If providing example dialogues, set them apart to avoid mixing them with actual rules.

### What to Include

- **Role and persona:** Define who the agent is, what tone it uses, what it should and shouldn't do. Be specific: "You are a helpful IT support agent for Contoso" is better than "You help people."
- **Response format:** Specify format preferences — lists, tables, bold emphasis, citation style. If you want concise answers, say so. If you want the agent to propose next steps, say so.
- **Scope boundaries:** Explicitly state what the agent should NOT do. "Do not answer questions about competitor products" or "If the user asks about pricing, redirect them to the sales team."
- **Tool usage rules:** Prefer using exact tool names in instructions. Names carry more weight with the planner than descriptions. For example: "Use the `CheckOrderStatus` tool when users ask about their order."
- **Knowledge usage:** Describe knowledge capabilities generically rather than naming specific documents. Don't say "Check the Benefits-2025.pdf file." Do say "Check the benefits knowledge base for current policy information."

### The T-C-R Framework

A useful structure for instruction writing (from the CIAOPS community):

- **Task:** What the agent should accomplish
- **Context:** What information and constraints apply
- **Requirements:** What format, tone, and boundaries must be met

### Common Instruction Mistakes

- **Too vague:** "Help users with their questions" gives the AI nothing to work with.
- **Too restrictive:** Scripting every possible response defeats the purpose of generative AI.
- **Contradictory rules:** If one instruction says "always be brief" and another says "provide detailed explanations," the agent will be inconsistent.
- **Referencing unavailable tools:** Instructions that mention tools or knowledge sources that aren't actually connected confuse the planner.
- **Including examples that become rules:** The AI may treat example queries as the ONLY queries it should handle. Use examples sparingly and frame them as illustrations, not specifications.

---

## Generative Orchestration vs. Classic Orchestration

This is the most important architectural decision for your agent. It fundamentally changes how the agent decides what to do.

### Classic Orchestration

- Agent selects topics based on matching user queries against predefined trigger phrases
- Actions can only be called explicitly from within a topic
- Knowledge is used as a fallback when no topic matches, or called explicitly from a topic
- Predictable, deterministic, but rigid and maintenance-heavy
- Best for: high-compliance scenarios where you need exact control, simple Q&A bots, scenarios with low tolerance for variation

### Generative Orchestration

- An LLM planner interprets user intent, selects the right tools/topics/knowledge, and executes multi-step plans
- Topics are triggered by description match rather than trigger phrases
- Actions can be invoked dynamically based on context
- Knowledge is queried proactively, not just as a fallback
- More natural conversations, less manual scripting, but introduces non-determinism
- Best for: complex multi-intent queries, scenarios requiring flexibility, agents that need to combine multiple data sources
- **Currently English-only for the generative orchestration layer**

### When to Use Which

Use **classic** when:

- The process is mission-critical or irreversible (payments, deletions)
- Regulatory requirements demand exact, auditable conversation flows
- You need 100% reproducible behaviour for the same input

Use **generative** when:

- Users phrase the same question in many different ways
- The agent needs to combine multiple tools/knowledge sources in a single response
- You want to reduce topic sprawl and maintenance overhead
- Multi-intent handling is important ("create an account AND send me the details")

Use **both** (hybrid): Let generative orchestration handle routing and conversation, but delegate critical actions to deterministic topics that execute step-by-step without AI interpretation.

---

## Orchestration Architecture: Three Control Layers

Production-grade agents should implement three layers of control:

### 1. Deterministic Layer

Traditional rule-based logic for mission-critical or irreversible actions. Processing a payment, deleting a record, modifying security settings — these should use strictly authored topics that execute step-by-step without AI interpretation. Either don't expose these actions to the AI planner, or wrap them in topics that always require user confirmation.

### 2. Hybrid (Intercept) Layer

AI flexibility within set boundaries with human or rule-based interception. The agent autonomously drafts a response or performs an action, but an approval step requires a manager review. Or the agent handles tasks up to a value limit, then escalates. Use this for medium-risk processes.

### 3. AI Orchestrator Layer

Fully generative. The LLM planner has freedom (within guardrails) for lower-risk queries. Most Q&A, information lookups, and simple multi-step requests. Bound by policies (e.g. the AI knows it can't call certain admin tools or reveal certain information).

**Define decision boundaries explicitly:** For every action and topic, determine whether it can be executed without confirmation, requires user confirmation in conversation, or requires offline approval via a workflow.

---

## Primary Enterprise Architecture Pattern

The most common production-grade agent architecture follows this layered composition:

```
Agent (Instructions + Orchestration Mode)
 ├── Topic A  →  Connector Action (real-time data)
 ├── Topic B  →  Power Automate Flow (complex orchestration / approvals)
 ├── Topic C  →  Deterministic scripted flow (no external call)
 ├── Knowledge Sources (SharePoint, Dataverse, websites)
 └── Connected Agent / Child Agent (delegated domain)
```

**Key design rules for this pattern:**

1. The Agent layer owns persona, instructions, and orchestration mode selection
2. Topics own individual business processes — one topic per user intent or workflow
3. Connectors and Flows are tools invoked by topics — they never own conversation flow
4. Knowledge Sources answer reference questions — they are not tools and cannot be called procedurally
5. Sub-agents and connected agents handle delegated domains — each with their own instructions and tools

**Agent → Topic → Tool composition** is the fundamental unit. An agent without topics relies entirely on generative orchestration with tools as direct actions. An agent with well-designed topics gets the benefit of deterministic control where it matters and generative flexibility elsewhere.

---

## Knowledge Source Design

### Choosing the Right Source Type

| Source                            | Best For                              | Sync Frequency            | Key Limitation                                                  |
| --------------------------------- | ------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| SharePoint (as website URL)       | Published pages, wikis                | Real-time-ish (via Graph) | Only modern pages, 7 MB file limit without M365 Copilot licence |
| SharePoint (as unstructured data) | Document libraries, PDFs, Word docs   | 4–6 hours                 | Max 1,000 files, ALM not supported                              |
| OneDrive                          | Personal/team document sets           | 4–6 hours                 | Max 1,000 files, user auth required                             |
| Dataverse                         | Structured business data, CRM records | Near real-time            | Max 2 sources, 15 tables per source                             |
| Public websites                   | External documentation, FAQs          | Varies                    | Use endpoint filtering in DLP                                   |
| Salesforce/Confluence             | CRM articles, wiki content            | 4–6 hours                 | No file count/size limits                                       |

### Knowledge Quality Guidelines

- **Relevance over quantity.** Don't dump every SharePoint site into the agent's knowledge. Ask: will this source help the agent answer the kinds of questions users will actually ask?
- **Test with and without knowledge.** Before adding a source, ask the agent a question it should answer from that source. Does it struggle or hallucinate? After adding the source, does it find the answer? If not, adjust instructions or reconsider the source.
- **Reformat content for AI consumption.** Community experience consistently reports that significant reformatting and reorganisation of source documents is needed for acceptable results. Headings, clear section breaks, and concise language help the retrieval layer find relevant content.
- **You cannot force the agent to use a specific knowledge article.** The AI chooses relevant articles based on the query. If the agent isn't using content you expect, refine your instructions to describe when that type of content should be consulted — but you can't point it at a specific file.
- **Structured files (XLSX) from SharePoint can be added but agents can't run code.** Responses to analytical questions will be poor. Don't use spreadsheets as knowledge sources for data analysis scenarios.
- **Tenant Graph Grounding with Semantic Search** dramatically improves SharePoint results. It requires an M365 Copilot licence in the same tenant and supports files up to 200 MB. Enable this whenever possible.

### Knowledge Sources vs Connectors — When to Use Which

| Scenario                                                    | Use Knowledge Source                  | Use Connector                         |
| ----------------------------------------------------------- | ------------------------------------- | ------------------------------------- |
| Company policies, HR handbooks, product docs                | ✅ SharePoint / OneDrive KS           |                                       |
| Real-time order status, account balance, live inventory     |                                       | ✅ Connector action                   |
| Per-user filtered Dataverse records (e.g. "my cases")       |                                       | ✅ Dataverse connector with user auth |
| Reference data that changes infrequently (FAQs, guidelines) | ✅ Any KS type                        |                                       |
| Data requiring joins, aggregation, or complex queries       |                                       | ✅ Connector or Power Automate Flow   |
| Broad "what does the company say about X" questions         | ✅ SharePoint KS with Graph grounding |                                       |
| Write-back operations (create, update, delete records)      |                                       | ✅ Connector action                   |
| Content gated by MIP sensitivity labels                     | ✅ KS with MIP enforcement (Preview)  |                                       |
| Analytics / reporting data (charts, calculations)           |                                       | ✅ Connector → Power BI or custom API |

**Rule of thumb:** If the user expects a static, authoritative answer (policy, procedure, reference), use Knowledge. If the user expects live, personalised, or transactional data, use a Connector.

---

## Designing Topics for Generative Orchestration

When generative orchestration is enabled, topic design shifts fundamentally.

### Trigger Design

- **Classic:** Define 5–10 trigger phrases that match expected user utterances
- **Generative:** Write a clear natural language description of what the topic does. The planner matches topics by description, not phrases.

Copilot Studio auto-generates descriptions from trigger phrases when you switch from classic to generative. The generated descriptions are usually adequate, but review and refine them.

### Topic Naming

- **Use intuitive, active names.** "ResetPassword" with description "Resets a user's password when they report being locked out" will be selected correctly. "Flow1" or "Topic_HR_3" will confuse the planner.
- **Avoid overlapping descriptions.** If multiple topics have similar descriptions, the agent may invoke them all for a single query. Test thoroughly and revise any overlapping descriptions.
- **Use simple, direct language.** Avoid jargon, slang, or technical terms in descriptions. Active voice, present tense: "This tool provides weather information" not "Weather information is provided by this tool."

### Topic Inputs and Outputs

- **Define clear input parameters with descriptions.** The orchestrator uses input names and descriptions to auto-prompt the user for missing information. "Username" is better than "param1". Add examples or validation formulas (Power Fx) to constrain inputs.
- **Auto-prompting replaces manual question nodes.** In generative mode, you don't need question nodes to ask for missing information. The AI generates questions based on input names. Make input names human-friendly ("start date", "email address").
- **Use output variables instead of direct messages.** Rather than having a topic send its final response in a message node, return it as an output variable. This lets the orchestrator combine that info with other steps and compose the final response. For example, a "Store Finder" topic outputs `NearestStoreLocation` rather than sending "Your nearest store is X" directly.
- **Avoid double-handling data.** If an action returns a summary as an output, don't also feed it into the LLM as open-ended context. Let the orchestrator include structured outputs directly. This prevents the model from repeating or over-generating content.

---

## Custom Triggers in Generative Orchestration

Three trigger types hook into the agent's lifecycle:

### On Knowledge Requested

- Fires right before the agent queries knowledge sources
- Provides read-only access to the search phrase the agent intends to use
- Lets you route queries to a proprietary index or inject additional data into results
- **Advanced/hidden trigger** — not visible in UI by default, must be enabled via YAML edit (name a topic exactly `OnKnowledgeRequested`)

### AI Response Generated

- Fires after the AI composes a draft answer but before it's sent to the user
- Lets you programmatically modify the response or citations (fix formatting, replace URLs, redact content)
- Can yield a custom message and use a `ContinueResponse` flag to control whether the original response still sends
- Use for last-second adjustments; heavy use suggests logic that should be in main instructions instead

### On Plan Complete

- Fires after the entire plan executes and the response is sent
- Use for end-of-conversation processes (redirect to survey, cleanup actions)
- Add conditional logic — you probably don't want this firing after every single user message in a multi-turn conversation

---

## Testing and Tuning

### Activity Map

In the test panel, the activity map shows the orchestrator's plan in real time: which topics/actions were invoked, in what order, what data flowed between steps. This is your primary debugging tool for generative orchestration.

### Iterative Refinement

- Make one change at a time and observe the effect
- If the agent is too verbose, tighten instructions about style and format
- If it invokes the wrong tool, the tool's description is probably too broad — narrow it
- If it misses a relevant topic, the description may not match user language — add example utterances to the description (sparingly)

### Automated Test Sets

- Generate test sets from knowledge sources (generative orchestration) or topics (classic orchestration)
- Up to 100 test cases per set
- Multiple evaluation methods: exact match, keyword, AI-powered response comparison
- Test results are available for 89 days — export to CSV for longer retention
- Multi-turn test type tests end-to-end conversation flows
- Plan validation checks that the agent's dynamic plan includes expected tools (tests what the agent does, not what it says)

### Copilot Studio Kit Testing

For advanced scenarios, the Copilot Studio Kit provides:

- Tests against Direct Line API for real-world conditions
- Azure Application Insights integration for enriched data points
- AI-powered comparison of generative answers against sample answers
- Intent recognition score analysis from Dataverse conversation transcripts

---

## Enterprise Design Rules of Thumb

A concise set of design heuristics distilled from enterprise deployments. Refer to these when making architectural decisions.

1. **Agentic first, procedural only when necessary.** Default to tools, MCP servers, child agents, and prompt-driven orchestration. Drop to topics and Power Automate flows only for deterministic checkpoints, compliance gates, or multi-step workflows that exceed a single tool call.
2. **One agent = one domain.** If a single agent needs more than 25–30 tools, split it into connected agents or sub-agents. The model's ability to select the right tool degrades as tool count increases.
3. **Topics for control, generative for flexibility.** Use deterministic topics for anything irreversible, regulated, or financially consequential. Use generative orchestration for Q&A, information lookup, and multi-intent routing.
4. **Knowledge for reference, connectors for transactions.** Knowledge Sources answer "what does the policy say?" Connectors answer "what is my balance right now?" Never use a Knowledge Source where real-time, per-user, or transactional data is needed.
5. **Start with the narrowest scope.** Begin with fewer tools, tighter instructions, and limited knowledge. Expand only when testing proves the agent needs more. An over-scoped agent hallucinates more and is harder to debug.
6. **Name everything for the model.** Topic names, tool names, input parameter names, and descriptions are consumed by the LLM planner. If a name is unclear to a human, it's unclear to the model. Use active, descriptive names.
7. **Output variables over direct messages.** Topics should return structured output variables rather than sending messages directly. This lets the orchestrator compose the final response and prevents double-handling.
8. **Test with the activity map first.** Before adding logging, use the built-in activity map to trace which topics and tools fired, in what order, and what data flowed. Most orchestration bugs are visible here.
9. **DLP is not optional.** Configure DLP policies before makers start building. Retrofitting DLP onto an existing agent portfolio is painful and disruptive.
10. **ALM from day one.** Work inside solutions from the start. Knowledge sources must be manually re-added after import — build this into your deployment runbook, not as an afterthought.
11. **Auth identity is an architecture decision.** Choose end-user delegated, maker/service account, or mixed identity early. Changing auth identity later requires reworking topics, connectors, and security roles.
12. **Channel dictates capability.** Not all channels support all features. Verify authentication, adaptive cards, file upload, and proactive messaging per target channel before designing conversation flows.
13. **Every write action needs confirmation.** Any tool that creates, updates, or deletes data should require explicit user confirmation or HITL approval. Never let the model autonomously execute destructive operations.
14. **Monitor before you scale.** Set up Application Insights, conversation transcripts, and Purview audit logs before expanding to additional user groups. Silent failures are common and invisible without monitoring.
15. **Re-evaluate after model upgrades.** When Microsoft updates the default model (e.g. GPT-4.1 mini → GPT-5), re-run your test suite. Model changes can alter orchestration behaviour, response quality, and tool selection patterns.
