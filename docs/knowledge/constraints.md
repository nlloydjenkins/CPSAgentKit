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

## Dataverse Choice/Option-Set Columns

- Both the Dataverse MCP Server and connector actions (InvokeConnectorTaskAction) require **integer values** for choice (option-set) columns. Passing text labels like "High" or "Open" causes a `FormatException` with no useful error detail. Include the integer mapping in agent instructions, tool `modelDescription`, and connector action input descriptions.
- Standard Dataverse choice columns use integer values starting at `100000000` by default. Custom choices may differ — always verify mappings against the live schema after table creation. A wrong mapping (e.g. swapping `100000001` for `100000002`) is invisible at the YAML level and produces silently incorrect behavior.
- This applies to creates, updates, and OData filter queries via both MCP and connector actions.

## Connector Action Input Modes

The CPS portal exposes three input modes per connector action input:

- **"Dynamically fill with AI"** (`AutomaticTaskInput` in YAML) — the orchestrator infers the value from context using the input's name and description.
- **"Ask the user"** — the orchestrator prompts the user for the value.
- **"Set as custom value"** (`ManualTaskInput` in YAML) — a fixed value (Power Fx expression or literal) used every time.

For autonomous pipelines (no user to prompt), every input must be either "Dynamically fill with AI" with a complete description, or "Set as custom value". Leaving any input as "Ask the user" or as an undescribed dynamic input will cause the pipeline to break into interactive mode. See tool-descriptions.md → Connector Action Input Configuration.

## Dataverse Column Length Limits

- Dataverse text columns have configurable maximum lengths (e.g. 100, 200, 1000, 4000 characters). When the orchestrator passes a value that exceeds the column's max length, the connector returns an HTTP 400 validation error.
- This is common when logging full email bodies or HTML content into preview/summary fields. Fix by increasing the column length in Dataverse or adding a truncation instruction to the input description.

## Connector Action Gotchas

- **Office 365 Users — "Get user profile (V2)"** requires a UPN input parameter, making it unsuitable when you just want the current user's identity. Use **"Get my profile (V2)"** instead — it returns the logged-in user automatically with no input required.
- **Outlook SendEmailV2 with `mode: Invoker`** sends email as the logged-in user, not a shared mailbox. Test tenant admin addresses may return HTTP 400 "invalid recipient" — use a real mailbox for testing.

## conversationStarters Format

- CPS requires `conversationStarters` entries to have `title` and `text` properties. Plain strings produce `MissingRequiredProperty` compile errors. Correct format:
  ```yaml
  conversationStarters:
    - title: Short label
      text: Full suggested prompt text
  ```

## Rate Limits

- Generative AI requests throttled per Dataverse environment (RPM and RPH).
- Accumulated conversation history can cause per-user token limit hits while other users are fine.
- OpenAIMaxTokenLengthExceeded error hidden in Activity Map — switch to Transcript view.

## Agent Instructions

- Hard limit: 8,000 characters. Quality and routing may degrade before the hard limit with dense or complex instructions — decompose into child agents or prompt tools rather than packing one instruction block.
- **Curly braces are evaluated as Power Fx expressions.** CPS evaluates `{` and `}` in the `instructions` field as Power Fx interpolation. JSON examples in instructions (e.g. `{"key": "value"}`) will cause parse errors or unexpected behavior. Only `{System.Bot.Components...}` references are valid. Use `key=value` notation or prose descriptions instead of JSON examples.

## Code Interpreter

- **Stdlib-only sandbox.** The code interpreter available to prompt tools runs a Python sandbox restricted to the standard library. External packages (`bs4`, `pandas`, `nltk`, `numpy`, `requests`, etc.) are not installed. Prompts that instruct execution requiring third-party libraries crash with `No module named 'X'`.
- **Exception: PyMuPDF (`fitz`) is available** and is the preferred library for PDF-to-text/HTML conversion (10-20x faster than alternatives). `pdfminer.six` is also available but extremely slow (3-5 minutes for 10 pages). Always test library availability in the sandbox before committing to a code-interpreter-dependent design.
- This is a hard sandbox constraint, not a prompt problem. Four production mitigations all failed: stdlib-only constraint in the prompt, exact code block provided, explicit prohibition on imports, and positive-only framing listing allowed libraries. The sandbox does not install packages on demand.
- **Workaround:** revert to qualitative assessment in the prompt, or perform the calculation in a Power Automate flow (which can call external services), or use a prompt tool without code interpreter and let the model reason about the inputs.
- Do not rely on code interpreter for HTML parsing, dataframe operations, statistical libraries, or anything beyond what stdlib (`json`, `re`, `math`, `statistics`, `datetime`, `collections`, `itertools`, `csv`, `string`) provides.
- **`modelDescription` hard limit: 1,024 characters.** CPS silently truncates or rejects descriptions exceeding this. Action descriptions for topic-owned tools can be shorter since the orchestrator doesn't route to them directly.
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

## Dataverse Connector — Dynamic Schema Binding (Multi-Table Writes)

- The generic "Add a new row to selected environment" connector action resolves its target table schema dynamically at runtime via the `entityName` input.
- Per conversation, the connector binds to the first table schema it encounters. Subsequent calls targeting a **different** table fail with `UnresolvedDynamicType` — the connector cannot re-resolve its schema within the same conversation.
- **Workaround:** Create separate, pre-bound connector actions — one per target table. Each action has `entityName` hardcoded as a `ManualTaskInput` with a fixed value (e.g., `cr85a_applications`, `cr85a_correspondences`). This removes the dynamic resolution and allows the agent to write to multiple tables in a single pipeline run.
- The same pattern applies to "Update a row" if targeting multiple tables, though this is less commonly needed.
- **Portal workflow:** Create each new action in the CPS portal (Tools → Add a tool → duplicate + pre-target), then sync locally via Get Changes. Edit only `modelDisplayName` and `modelDescription` locally. Do not hand-author the action YAML from scratch.
- Give each pre-bound action a unique, descriptive `modelDisplayName` (e.g., "Create application record", "Log correspondence", "Log compliance check"). The orchestrator routes by tool name and description — generic names like "Add a new row 2" will misroute.
- After creating the pre-bound tools, **disable or remove the generic "Add a new row" tool** from the agent. If it remains active, the orchestrator may prefer it over the targeted tools due to its broader description.

## Agent Flow Input Declarations — Platform Behavior (Empirically Verified)

The CPS orchestrator's handling of flow tool inputs depends on the input type declaration. These behaviors are platform-level and **cannot be overridden** by instructions, `modelDescription`, or input `description` fields:

| Input Declaration           | Orchestrator Behavior                                                           | Can Orchestrator Override Default?                  | Notes                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `AutomaticTaskInput`        | Orchestrator resolves value. **Prompts user if value is empty string or null.** | N/A (no default)                                    | "Never ask the user" in description has no effect on prompting behavior when value is empty |
| `ManualTaskInput value: ""` | No prompting. Uses static default value.                                        | **No** — orchestrator's value is silently discarded | Data loss: values passed by the orchestrator never reach the flow                           |
| Mixed Manual + Automatic    | **BadRequest error** — all values arrive as null                                | N/A                                                 | Mixing input types on a single tool is unsupported                                          |
| No declarations at all      | **Prompts for everything**                                                      | N/A                                                 | Removing all input declarations makes every field interactive                               |

### Key Insight

The orchestrator treats any `AutomaticTaskInput` with an empty string or null value as "unresolved" and falls back to user prompting — regardless of how many "never ask" instructions exist. This is the root cause of autonomous pipelines breaking when optional fields (account number, DOB, contact number) are legitimately absent from inbound data.

### The N/A Sentinel Pattern (Workaround)

To prevent prompting for optional fields while preserving existing database values:

1. **Extraction agent** returns `"N/A"` (literal string) for any field not found in the source data — never null, never empty string
2. **Orchestrator** passes `"N/A"` through to the flow tool. CPS sees a non-empty string and does not prompt.
3. **Power Automate flow** checks: `@if(or(empty(triggerBody()?['text_N']), equals(triggerBody()?['text_N'], 'N/A')), variables('existing_value'), triggerBody()?['text_N'])`
4. The flow preserves existing database values when `"N/A"` is received, and updates with the new value otherwise.

This pattern is essential for any autonomous pipeline where:

- Some fields are optional and may not be present in every inbound message
- The agent must not prompt the user (because there is no user — it's trigger-driven)
- Existing database values must be preserved when new data is not provided (e.g., subsequent emails that only change one field)

## Power Automate Workflow.json — Source of Truth

Agent Flow `workflow.json` files are owned by Power Automate, not by Copilot Studio:

- **Get Changes** from CPS pulls the portal's current flow definition, overwriting local edits
- **Apply Changes** from VS Code pushes local YAML/JSON to the portal — this CAN update the flow
- Local edits to workflow.json are valid for backup and version control, but the portal version is what executes at runtime
- If local and portal versions diverge, the portal version wins at runtime regardless of what's in the workspace

### Practical implications:

- Always verify flow changes took effect by checking the PA designer after Apply Changes
- Keep workflow.json in version control as a backup — it's the only way to recover from portal-side damage
- When the portal breaks a flow (e.g., by replacing a connector with an empty For_each), the local backup is your recovery path

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
