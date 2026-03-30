# CPS Platform Constraints

## Orchestration

- Generative orchestration: English-only
- Conversation history: last 10 turns visible to the orchestrator. Earlier context is dropped.
- Tool limit: 128 hard max, 25-30 recommended. Beyond 30, routing quality degrades — agent ignores instructions, misroutes, makes unnecessary calls.
- When switching from classic to generative: Conversational Boosting system topic is bypassed. Custom data sources, Bing Custom Search in that topic — all ignored.
- Multiple Topics Matched system topic does not fire in generative mode.
- Fallback (`OnUnknownIntent`) system topic is also bypassed in generative mode — the planner handles unknown intents directly. Any escalation logic in the Fallback topic will never trigger.
- Start Over, Goodbye, Thank You retain classic `OnRecognizedIntent` triggers but these only fire if the recognizer happens to match on them. Under generative orchestration, routing is description-driven — topics with only `triggerQueries` and no useful `description` may route unreliably or not at all.
- Auto-generated topic descriptions (from trigger phrases) are adequate but should always be reviewed.

## Knowledge Sources

- Max 500 knowledge objects per agent.
- 1,000 files, 50 folders, 10 layers of subfolders per source.
- Beyond 25 knowledge sources, orchestrator uses internal GPT to filter which to search — based on descriptions.
- Uploaded files are NOT part of the 25-source search limit.
- Without M365 Copilot license in tenant: SharePoint files limited to 7 MB (silently ignored above this).
- Indexing delay: 5-30 minutes after enabling unstructured data.
- Zero control over chunking — Dataverse applies undocumented defaults.
- No control over query type (keyword/vector/hybrid), reranking, or metadata filters.
- Citations from knowledge sources cannot be used as inputs to other tools.
- Generative orchestration does not support custom data or Bing Custom Search as knowledge sources — embed in a generative answers node in a topic instead.

## SharePoint Specifics

- Only modern pages supported. Classic ASPX pages ignored.
- Accordion nav menus and custom CSS break retrieval.
- "&" in document/folder names not supported.
- Lists with >12 lookup columns in default view not supported.
- Generative answers from SharePoint not available to guest users in SSO-enabled apps.
- Tenant graph grounding with semantic search requires M365 Copilot license + "Authenticate with Microsoft" auth.

## Multi-Agent

- No circular dependencies (A→B→A blocked).
- No multi-level chaining (parent→child→child's child blocked). Flatten hierarchy.
- Connected agent responses are always summarised by the parent orchestrator — by design, for security.
- Citations/links stripped in parent-child handoffs.
- MCP tools on child agents are NOT invoked when called via parent orchestration. The child agent fires, but MCP calls don't execute. Workaround: parent owns the MCP tool and passes results to children as context.
- Child agents have separate tool limits from the parent (benefit of using them).
- **Autonomous triggers (scheduled)** can only be owned by top-level (parent) agents. Child agents CANNOT own triggers. If the child runs the proactive logic, triggers must be on the parent with delegation to the child.
- Connected agents require separate publishing, separate lifecycle management, and their responses are always summarised by the parent (citations stripped). For internal single-team solutions, child agents are simpler with less operational overhead.

## Flows and Connectors

- **Power Automate flows run as the author** (maker identity). This is a critical governance constraint — approvals, user-attributed actions, and audit trails WILL reflect the flow maker, not the end user. Agent Flows have the same maker-only constraint with no workaround. For user-attributed operations (approvals, user-context Dataverse queries), prefer CPS connector tools with invoker auth over PA flows.
- Per-connection auth override: individual connector connections within a flow can use invoker identity, but only for connections explicitly configured this way. The flow shell itself still runs as the author.
- Cloud flow timeout: 100 seconds. Place post-response logic after "Return value(s) to Copilot Studio" step.
- Connector payload limit: 5 MB public cloud, 450 KB GCC.
- Direct Line message size: 262,144 bytes (includes all context variables).
- Omnichannel ACS limit: 28 KB. Variables silently dropped if exceeded.

## Rate Limits

- Generative AI requests throttled per Dataverse environment (RPM and RPH).
- Accumulated conversation history can cause per-user token limit hits while other users are fine.
- OpenAIMaxTokenLengthExceeded error hidden in Activity Map — switch to Transcript view.

## Agent Instructions

- Hard limit: 8,000 characters. Quality and routing may degrade before the hard limit with dense or complex instructions — decompose into child agents or prompt tools rather than packing one instruction block.
- Temperature control only available in prompt actions, not at agent level.
- Content filtering: no logging, no reason code, no diagnostic info when triggered.

## Authoring Workflow

- Prompts: create in Copilot Studio or AI Hub first, then sync locally and refine. This is the supported workflow Microsoft documents.
- Connectors, MCP servers, workflows, and connection references: scaffold-first — create or attach the tool in Copilot Studio, then sync and edit the generated files locally.
- Actions, workflows, and connection references: edit the generated assets rather than inventing them from scratch. Preserve IDs, bindings, and generated structure.

## File Processing

- If a workflow depends on analyzing uploaded files (PDF, DOCX, etc.), add an explicit preprocessing step before delegation. Use a prompt tool with code interpreter enabled to convert the file to text/HTML/Markdown first, then pass normalized content onward.
- The preprocessed output is the **canonical input** for all downstream agents. Reinforce this in both orchestrator and specialist instructions — agents must use the converted content, not reference the original binary.
- Handle multiple input paths: users may provide a SharePoint URL (fetch then convert) or upload directly (convert inline). Use a branching topic to handle both.
- Include a failure path: if conversion fails, stop and ask the user for a replacement or text-based source document. Do not silently proceed with degraded input.
- Tell specialist agents that the content "was converted from the uploaded document" so they don't reference the original format or assume they can access the raw file.

## Prompt Tools

- Prompt tools are text-in, text-out only. They cannot return images, files, or binary content. If the architecture assumes visual or file output from a prompt tool, redesign to either use an external rendering service or return the content as text.
- To return structured data from a prompt tool, have the prompt return JSON as its text response, capture it via `predictionOutput`, and parse it downstream using the `JSON() -> ParseJSON() -> .property -> Text()` chain (see `yaml-syntax.md`).

## Code Interpreter

- The documented configuration path for code interpreter is through prompts (prompt tools with code interpreter enabled in settings).
- If exported agent YAML contains `gptCapabilities.codeInterpreter`, preserve it — but recommend prompts as the primary path when building new capabilities.

## Content Moderation

- **Portal-only setting** — content moderation must be configured in the CPS portal under Settings → Generative AI. There is **no YAML field** to set this. The `settings.mcs.yml` does not include a content moderation property. The Build phase must flag this as a required manual portal step.
- Content moderation can be set to `Low`, `Medium`, or `High`. This is the **only** available control surface for content filtering — there is no per-topic, per-utterance, or per-tool override.
- For agents that process financial, medical, legal, HR, or other specialist domain content, `Low` may be necessary to avoid false positive content filtering that blocks legitimate terms (e.g. employment law terminology, right-to-work language, compliance content).
- Content filtering remains a black box at every level — no logging, no reason code, no diagnostic info when triggered. Debugging content filter blocks is currently impossible without a support ticket.
- Setting the level does not provide any additional transparency or diagnostics — it only adjusts the threshold.

## MCP in Multi-Agent Flows

- MCP is fully supported as an agent tool (Streamable transport, added from the Tools page, generative orchestration required).
- Field observation: MCP is more reliable when the parent/orchestrator owns the MCP tool and passes results to children as context, rather than relying on MCP execution inside child-agent orchestration.

## Licensing and Billing

- **Copilot Credits** are the unit of billing (replaced messages, September 2025). Credits are consumed based on task complexity, not per-message. Credits do NOT roll over month-to-month.
- **M365 Copilot licensed users:** Interactive usage of agents published to Copilot Chat, Teams, or SharePoint is included at no additional credit cost. Autonomous/scheduled runs always consume credits regardless of licensing.
- **Testing credits:** Messages in the embedded test chat do NOT consume credits. However, prompts and models in agent flows DO consume credits even during testing. Prompt builder testing is free.
- **Proactive greetings are billed.** A proactive greeting counts as a billed credit even if the user never responds.
- If you exceed purchased capacity, technical enforcement (service denial) applies.

## Governance and DLP

- DLP enforcement is mandatory for all tenants (early 2025) — no agent-level exemptions.
- DLP can block: authentication methods ("No auth" connector), knowledge source types (SharePoint, public websites), connectors as tools, HTTP requests, skills, publishing channels, and event triggers.
- Use endpoint filtering for granular control (allow/deny specific SharePoint URLs or public website domains).
- Connectors in different DLP data groups (Business, Non-Business, Blocked) cannot be used together in the same agent.
- Purview DLP (M365 Copilot layer): can block responses when prompts contain sensitive information types (SITs) or when grounded content has blocked sensitivity labels.
- Agents published to M365 Copilot inherit Purview DLP controls — error messaging may not clearly explain why a response was blocked.

## Settings

- **Orchestration mode:** Toggle between generative and classic orchestration in Settings > Generative AI. Changing takes time to apply — publish after changing to confirm.
- **Deep reasoning:** Optional capability for complex reasoning at higher credit cost. Evaluate before enabling.
- **Channel description:** Separate from the main instructions field — governs how the agent behaves in Teams/M365 Copilot. Important for multi-domain agents (HR + IT) to ensure accurate intent routing.
- **Multi-language:** Generative orchestration is English-only for the orchestration layer — planning happens in English even if the agent responds in another language.

## Settings Coherence

Settings flags in `settings.mcs.yml` and capabilities in `agent.mcs.yml` must be consistent with each other and with what the agent actually has configured:

- `isSemanticSearchEnabled: true` without any knowledge sources configured is a misconfiguration — either add knowledge sources or disable it. Semantic search with nothing to search wastes compute and can cause unexpected behaviour if knowledge is added accidentally later.
- `useModelKnowledge: false` combined with `gptCapabilities.webBrowsing: true` is contradictory — web browsing IS model knowledge from the web. If the agent should only use its own tools and data, disable both.
- `useModelKnowledge: false` also suppresses the agent's follow-up clarifying questions. If the agent should ask clarifying questions before acting, `useModelKnowledge` must be `true` — or the agent must implement clarifying logic explicitly in topic prompts.
- `optInUseLatestModels` and `aISettings.model.modelNameHint` can conflict — `modelNameHint` requests a specific model while `optInUseLatestModels` tells the platform to override with whatever is newest. Clarify which should take priority and document the intended model strategy.
- When reviewing an agent, check that every enabled capability (`webBrowsing`, `codeInterpreter`, `isFileAnalysisEnabled`, `isSemanticSearchEnabled`) has a corresponding implementation. An enabled feature with no backing configuration is dead config at best, a grounding leak at worst.
- **Portal defaults are aggressive:** New agents arrive from the portal with `useModelKnowledge: true`, `webBrowsing: true`, `isSemanticSearchEnabled: true`, `isFileAnalysisEnabled: true`. The Build phase MUST validate these against the architecture specification and fix mismatches. For internal enterprise agents, most of these should typically be `false`.
