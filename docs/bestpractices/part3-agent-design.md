# Copilot Studio Assessment Guide — Part 3: Agent Design (Instructions, Knowledge & Orchestration)

How to configure agents that behave predictably and answer accurately.

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

## Knowledge Source Design

### Choosing the Right Source Type

| Source | Best For | Sync Frequency | Key Limitation |
|--------|----------|----------------|----------------|
| SharePoint (as website URL) | Published pages, wikis | Real-time-ish (via Graph) | Only modern pages, 7 MB file limit without M365 Copilot licence |
| SharePoint (as unstructured data) | Document libraries, PDFs, Word docs | 4–6 hours | Max 1,000 files, ALM not supported |
| OneDrive | Personal/team document sets | 4–6 hours | Max 1,000 files, user auth required |
| Dataverse | Structured business data, CRM records | Near real-time | Max 2 sources, 15 tables per source |
| Public websites | External documentation, FAQs | Varies | Use endpoint filtering in DLP |
| Salesforce/Confluence | CRM articles, wiki content | 4–6 hours | No file count/size limits |

### Knowledge Quality Guidelines

- **Relevance over quantity.** Don't dump every SharePoint site into the agent's knowledge. Ask: will this source help the agent answer the kinds of questions users will actually ask?
- **Test with and without knowledge.** Before adding a source, ask the agent a question it should answer from that source. Does it struggle or hallucinate? After adding the source, does it find the answer? If not, adjust instructions or reconsider the source.
- **Reformat content for AI consumption.** Community experience consistently reports that significant reformatting and reorganisation of source documents is needed for acceptable results. Headings, clear section breaks, and concise language help the retrieval layer find relevant content.
- **You cannot force the agent to use a specific knowledge article.** The AI chooses relevant articles based on the query. If the agent isn't using content you expect, refine your instructions to describe when that type of content should be consulted — but you can't point it at a specific file.
- **Structured files (XLSX) from SharePoint can be added but agents can't run code.** Responses to analytical questions will be poor. Don't use spreadsheets as knowledge sources for data analysis scenarios.
- **Tenant Graph Grounding with Semantic Search** dramatically improves SharePoint results. It requires an M365 Copilot licence in the same tenant and supports files up to 200 MB. Enable this whenever possible.

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
