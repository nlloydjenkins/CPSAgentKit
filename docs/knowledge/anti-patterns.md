# CPS Anti-Patterns

## Tool/Action Connection Anti-Patterns

**Using `Microsoft Copilot Studio - Execute Agent` (or `Execute Agent and wait`) for in-CPS agent-to-agent calls.** The connector exposes `ExecuteCopilot` and `ExecuteCopilotAsyncV2`. Despite the second one being labelled "and wait", both return only a `ConversationId` — the agent reply text is delivered out-of-band on the conversation, not in the connector response. These operations are designed for **external automation** (Power Automate flows fire-and-forgetting into CPS), not for agent-to-agent orchestration inside CPS. If you see a CPS agent calling another CPS agent and only receiving a conversation id, the fix is not "configure the output schema" — replace the connector tool with a **connected agent**. Connected agents are invoked through the orchestrator and the reply comes back inline (with the documented summarisation tradeoff). See `multi-agent-patterns.md` → Agent-to-Agent Invocation.

**Renaming a tool without updating all references.** You CAN rename a tool/action connector, but if you do, you MUST update EVERY `/ToolName` reference in instructions, topic triggers, and any other YAML that references it. A single missed reference = broken agent. Prefer keeping existing names unless the user explicitly asks to rename.

**Using shortened or altered tool names in /ToolName references.** If the tool is "Microsoft Dataverse MCP Server (Preview)", referencing it as "/Dataverse MCP" or "/MCP Dataverse" won't match. The orchestrator requires exact name match.

**Recreating tools instead of updating them.** When a build step generates tool config, it should update the existing tool — not delete and recreate it. Recreating loses the connection setup.

**Not reading action YAML files before writing /ToolName references.** Always check the actual tool name from the workspace files. Don't assume or abbreviate.

## Architecture Anti-Patterns

**Single mega-agent with 40+ tools.** Routing degrades beyond 25-30 tools. The orchestrator starts ignoring instructions and misrouting. Split into child agents.

**Creating a child agent for every subtask.** Child agents add orchestration overhead and latency. Only use when the subtask has its own knowledge/tools, needs different governance, or you'll reuse it. A simple topic is often sufficient.

**Multi-level agent chaining.** Parent → child → grandchild is blocked. Design flat hierarchies. If you need depth, use child agents within connected agents.

**Circular agent dependencies.** A → B → A is blocked. Use hub-and-spoke with a central router.

**Relying on conversation history for state.** The orchestrator references only the last ~10 turns (per Microsoft's generative-orchestration FAQ). Store critical state in variables.

## Prompt Anti-Patterns

**Negative constraints as primary control.** "Never discuss competitors" WILL be violated. Create a dedicated topic with a manual response instead.

**Long, complex instruction sets.** The 8,000-character hard limit feels generous, but quality and routing may degrade before hitting it with dense or complex instructions. If instructions are getting long, decompose into child agents or prompt tools rather than packing one instruction block.

**Instruction accumulation as the default fix.** When output quality drops or a section is missing, the instinct is to add more instructions. Production evidence shows this plateaus and can regress previously-working behaviour. If you've added instructions twice and the problem persists, the fix is structural — child agents, prompt tools, knowledge files, or output templates — not more text.

**Prose descriptions of output format.** "Include a summary table with pillar scores" is unreliable. The model defaults to trained summary behaviour. Use literal templates with placeholders in knowledge files instead. See Output Format Enforcement in prompt-engineering.md.

**Template-line reinforcements ("MUST include X") at the end of criterion definitions.** Appending emphatic reinforcements to criterion definitions consistently fails to produce adoption — tested 0 of 3 successful adoptions across a production build. The fix is structural: put a literal template in the body of the prompt with a worked example of correct output and a negative example showing the compressed form that must not appear. Show don't tell. See Output Format Enforcement in prompt-engineering.md.

**Combined output fields for distinct data points.** Defining a single output field that combines multiple values (e.g. "Reading age/grade: [combined]") causes models to merge, omit, or inconsistently format the individual values. Use separate sub-fields with their own labels (e.g. "Estimated reading age: [value]" and "Grade level: [value]" on separate lines). Each distinct data point should be a structurally separate field in the prompt template.

**Vague tool/topic descriptions.** "Helper tool" or "Support topic" gives the orchestrator nothing to route on. Descriptions need specific intents AND explicit exclusions.

**Duplicate/overlapping descriptions.** Two tools described as "handles account queries" = coin flip routing. One must be differentiated or restricted to explicit invocation.

**Instructing default behaviour.** Don't instruct "be professional and polite" — it already is. Only add tone instructions for specific deviations.

**Trying to control retrieval via instructions.** "Always search document X first" is unreliable. The AI chooses based on query relevance.

## Multi-Agent Anti-Patterns

**Using child agents for specialists whose only job is structured output.** Generative orchestration summarises child agent responses between stages. For pipelines whose specialists emit strict templates (numbered criteria, labeled blocks, structured data) and nothing else — no independent tools, knowledge, or governance — prompt tools invoked from a single topic preserve structure where child agents will not. See multi-agent-patterns.md → Prompt Tools Over Child Agents for Summarisation-Sensitive Pipelines and pipeline-patterns.md.

**Missing agent boundary prohibitions.** Positive scope alone is insufficient — specialist agents leak into each other's domains. Add explicit prohibitions stating what each agent must NOT assess. See multi-agent-patterns.md → Agent Boundary Enforcement for the full pattern.

**Letting the orchestrator or reporter rewrite specialist output.** Generative orchestration summarises by default. If specialists produce detailed assessments and the next stage rewrites them into narrative summaries, you lose the detail. Use labeled output blocks and instruct downstream agents to reproduce raw content before adding any summary.

**No version stamps on agents.** Without version stamps, you can't tell which version produced a given output, and regression detection becomes guesswork. Stamp every agent with a version in its instructions and require it in output.

**No structured test-evaluate-fix cycle.** Building without a scoring rubric and structured review process leads to "it looks OK" testing. Define your rubric before the first live test. After each test, produce a structured review: what adopted, what regressed, what's still missing. Track version history with scores to see trajectory.

## Prompt Tool Anti-Patterns

**Changing a shared prompt tool's required inputs without auditing callers.** When a prompt tool's input schema changes (e.g. adding required parameters), every topic referencing that prompt tool breaks simultaneously with compile errors. Before adding required inputs to a shared prompt tool, audit all calling topics. Wire the new inputs in each topic or remove the action node from topics that cannot supply them.

**Assuming prompt tools can return non-text output.** Prompt tools are text-in, text-out only. They cannot return images, files, or binary content. If the design requires visual output, use an external rendering service or return the content as text (e.g. HTML) for the caller to render.

## Knowledge Anti-Patterns

**Uploading entire documentation sites as one knowledge source.** The chunker doesn't understand topic boundaries. Split into focused, topic-specific documents.

**Ignoring knowledge source descriptions.** At >25 sources, bad descriptions mean entire knowledge sources never get searched.

**Large files without M365 Copilot license.** SharePoint files over 7 MB are silently ignored. No error — just no answers.

**Mixing unrelated content in one document.** Chunks may contain text from two unrelated topics, producing confused answers.

**Assuming knowledge works like a search engine.** CPS retrieval is non-deterministic. Identical queries can return different results depending on indexing state, user permissions, and orchestration context.

## Deployment Anti-Patterns

**Testing only in the test pane.** Test pane uses maker credentials. Production uses end-user credentials. Knowledge accessible to you may not be accessible to users. Always test in the target channel.

**Assuming Teams auto-updates.** Publishing changes don't propagate to all users automatically. Users can run different agent versions simultaneously.

**Deleting knowledge sources and assuming they're gone.** UI deletion doesn't remove the underlying reference. Check via API.

**Using maker connections in flows called by agents.** Blocked by DLP. Share flows with run-only permissions.

## Dataverse Connector Query Anti-Patterns

**Passing text labels for choice/option-set columns.** The Dataverse MCP Server and connector actions both require integer values for choice columns. Passing text like "High" or "Open" causes a `FormatException` with no useful error detail. Always include the integer mappings in agent instructions, tool descriptions, and connector action input descriptions (e.g. `Priority: Low=100000000, High=100000002`).

**Seeding currency or large-count metrics into a default `decimal` column without verifying its range.** `create_table` decimals silently cap at `0 → 1,000,000,000`. The first `create_record` with a value above 1B fails — and if it's part of a parallel batch, the table is left with a few rows in raw units and the rest never inserted. Validate the range with one test row before any bulk insert, pre-scale to millions, or use a `Currency` column. See `dataverse-mcp-setup.md` → Known Gotchas.

**Assuming `update_table` can widen an existing column.** `update_table` is add-only — it cannot alter range, required-ness, display name, or type. If a column was created with the wrong shape, plan to add-and-migrate, drop+recreate the table (destructive), or edit in the maker portal. There is no in-MCP fix.

**Calling `read_query` with parameter name `query`.** The Dataverse MCP uses `querytext`. Every other SQL-shaped MCP server uses `query`, so the first call from a fresh agent typically fails with a schema-validation error. Set the parameter name explicitly in instructions and `modelDescription`.

## Settings Coherence Anti-Patterns

**Leaving `isSemanticSearchEnabled: true` on agents with zero knowledge sources.** Test harnesses, automation drivers, and strict tool-only agents have no corpus to search. The default `aISettings.isSemanticSearchEnabled: true` lets the built-in Search topic fire when generative orchestration can't decide on a tool, surfacing canned responses like "No information was found that could help answer this." or "I'm sorry, I'm not sure how to help with that. Can you try rephrasing?". Users read this as a broken agent. Rule: **if the agent has zero knowledge sources, `isSemanticSearchEnabled` MUST be `false`** for deterministic tool routing. Same shape as the existing `useModelKnowledge` guidance, just for the search lever. See `constraints.md` → Settings Coherence.

## Test-Harness Anti-Patterns

**Describing a target agent's persona in detail inside a test-harness prompt without explicitly disowning it.** When the harness needs rubrics for judging replies — refusal patterns, voice, in-character behaviour — the orchestrator picks up the most-described identity in the prompt and runs with it. Symptom: the user types "run tests" and the harness answers _as the persona under test_. Mitigations:

1. Top-of-prompt `# Trigger` / `# Identity` block, before role, explicitly disowning the persona ("You are NOT &lt;Persona&gt;. You are a tester.").
2. Single deterministic mapping for ANY user input → run the suite.
3. Explicit prohibitions on the most-likely drift outputs ("never say 'I'm not sure how to help'", "never defer to knowledge search").

This is a generalisation of the tool-first rule: when an agent's instructions extensively describe behaviour belonging to _another_ agent (persona under test, target style guide, target voice), expect identity drift unless explicitly defended against.

**Using "Get user profile (V2)" when you need the current user.** This Office 365 Users action requires a UPN input parameter. Use "Get my profile (V2)" instead — it returns the logged-in user automatically with no input.

**Fetching all rows without `$filter` or `$top`.** Direct `InvokeConnectorAction` calls against Dataverse return up to 5,000 rows per page by default. As tables grow, unfiltered queries degrade performance and may silently miss rows beyond the first page.

**Not checking `@odata.nextLink` in connector results.** If the result set exceeds one page, the topic operates on incomplete data with no error or warning. Either add `$top` to guarantee the full result fits one page, or follow `@odata.nextLink` to fetch remaining pages.

**Loading the same table in multiple topics independently.** If `ConversationStart` and a recommendation topic both fetch all rows from the same table, the agent makes two full-table round trips per conversation. Share data via variables or filter at query time.

**Unfiltered startup queries.** Fetching an entire table on `OnConversationStart` means every new conversation pays the full query cost — even if the user never needs that data. Defer data loading to the topic that actually uses it, or filter to the minimum required (e.g. distinct break names instead of all rows).

## Build-Review Inconsistency Anti-Pattern

**Generating agent configuration with the Build command, then discovering problems with the Review command.** If the build process doesn't enforce the same rules the review checks, the user is caught in a frustrating generate-review-fix cycle. Every best-practice rule checked by the review should either be (a) enforced during build generation, or (b) explicitly flagged as a known build gap that will be caught during review.

## The "It Worked Yesterday" Pattern

Common causes when a working agent suddenly breaks:

1. Knowledge source re-indexed with different chunking (after doc update)
2. User permissions changed (conditional access, SharePoint sharing)
3. Rate limits hit (accumulated conversation history pushing token limits)
4. Model version changed (GPT version updates can change behaviour)
5. Environment-level DLP policy changes

## Dataverse Multi-Table Write Anti-Patterns

**Using the generic "Add a new row" connector for multiple tables.** The connector binds to the first table's schema per conversation. The second call targeting a different table fails with `UnresolvedDynamicType`. Create separate pre-bound actions per table instead. See constraints.md → Dataverse Connector — Dynamic Schema Binding.

**Leaving the generic "Add a new row" tool active alongside targeted tools.** The orchestrator may prefer the generic tool over targeted tools because its broader description matches more intents. If you've created targeted tools, disable or remove the generic one.

**Renaming a generic tool's `modelDisplayName` but not removing it.** Even after renaming the generic "Add a new row" to something specific like "Create application record", the portal Activity Map may still show the old name. The orchestrator may still treat it as the generic tool. Pre-bound actions (created as new tools with hardcoded `entityName`) are more reliable than renaming the generic one.

## Using Global Variables as an Invocation Contract

**Telling the orchestrator to populate `Global.*` variables before calling a topic.** A generative orchestrator can describe or reason about state, but runtime mutation of variables happens only through executed topic/action nodes such as `SetVariable`. If a workflow contract says "set these globals, then call this topic," the planner may narrate success while the topic still sees blank variables. The receiving topic runs with stale or empty `Global.*`, writes nothing or writes garbage, and the orchestrator reports success based on its own plan rather than observable side effects.

**Fix:** Use topic inputs as the invocation contract (see `yaml-syntax.md` → Topic Inputs as the Orchestrator-to-Topic ABI). The orchestrator binds typed arguments at invocation time; the receiving topic reads them as `Topic.<InputName>`. Inside the topic, copy inputs into globals only if downstream existing logic still depends on global scope (see `pipeline-patterns.md` → Topic-Input Handoff Pattern).

**Diagnostic symptoms:**

- Activity Map shows the write/publish topic was not invoked, or was invoked with blank input guards.
- The agent reports success while the target SharePoint list or Dataverse table has no new row.
- A hard-coded test topic that bypasses the orchestrator works, proving connector wiring is sound.
- Topic-entry diagnostic `SendActivity` nodes show empty values for the inputs the orchestrator claimed to set.

This is closely related to Pipeline Early Termination — the orchestrator narrates a successful plan instead of executing it.

## Pipeline Early Termination in Generative Orchestration

**Assuming the orchestrator will automatically chain all stages.** Generative orchestration treats child agent outputs as potential final answers. After a child returns, the orchestrator may display the output and stop — even if instructions describe further stages. This is the single most common failure mode for multi-stage autonomous pipelines.

**Fix:** Add explicit anti-termination instructions at two levels:

1. A **CRITICAL header** above the workflow stages: "Every inbound trigger MUST progress through ALL stages. Do NOT stop after [first child]. Do NOT display child agent outputs to the user — they are internal pipeline data."
2. **Per-stage suppression:** After each child agent call, add "Do NOT show this output to the user — immediately proceed to stage N."

These instructions must be emphatic and repeated per stage. A single top-level "follow all stages" instruction is insufficient — the orchestrator needs stage-level reinforcement.

## Using Empty Strings for Missing Optional Fields in Flow Inputs

**Passing empty strings for optional fields via AutomaticTaskInput.** CPS treats empty string as "unresolved" and prompts the user for the value — even in autonomous pipelines where there is no user. This is the single most common cause of autonomous agents breaking into interactive mode mid-pipeline.

**What doesn't work:**

- Setting `AutomaticTaskInput` value to `""` — prompts the user
- Returning null/undefined from child agents — prompts the user
- Adding "never ask the user" to the input description — ignored by the platform
- Adding "pass empty string for missing fields" to parent instructions — CPS overrides this

**What works:** The N/A sentinel pattern. Return `"N/A"` (a non-empty string) for missing fields. The flow checks for `"N/A"` and treats it as empty. See constraints.md → Agent Flow Input Declarations.

## Connector Action Input Anti-Patterns

**Leaving inputs at default "Dynamically fill with AI" without descriptions.** An undescribed dynamic input causes the orchestrator to prompt the user — even when the orchestrator already holds the correct value. One missing description can poison all inputs on the tool. Every `AutomaticTaskInput` must have a description stating the value source, format, and "never ask the user" for autonomous pipelines.

**Exposing system fields as dynamic inputs.** Import Sequence Number, Time Zone Rule Version Number, UTC Conversion Time Zone Code, Owner, Status Reason, and Return Full Metadata must never be "Dynamically fill with AI". Remove them or set to custom values.

**Exposing primary key columns as dynamic inputs.** The orchestrator cannot generate a valid GUID and will prompt the user. Set primary key inputs to a custom value of `GUID()`.

**Referencing fields in modelDescription that don't exist as inputs.** If `modelDescription` mentions a field name that has no corresponding `AutomaticTaskInput` or `ManualTaskInput`, the orchestrator gets confused and falls back to prompting for other fields. Audit `modelDescription` against actual inputs after every change.

**Using schema names in orchestrator prompts when connector actions use display names.** If the orchestrator prompt says `cr85a_name` but the connector action input is labelled "Application Reference Number", the orchestrator may fail to map the value. Always use display names as they appear in the connector action.

**Putting choice column integer mappings only in agent instructions.** The orchestrator reads the input description when filling dynamic inputs — agent instructions alone are not sufficient. Include the full integer mapping in the input description: `"Direction: Inbound=100000000, Outbound=100000001"`.

**Not verifying integer mappings against the live Dataverse schema.** A wrong mapping (e.g. swapping `100000001` for `100000002`) is invisible at the YAML level. After creating Dataverse tables, verify all choice column integer values against the live schema — standard defaults start at `100000000` but custom choices may differ.

## Referencing Tools That Don't Exist in the Agent

**Instructing the agent to use a tool that isn't configured.** If instructions reference `/Send an email from a shared mailbox (V2)` but the actual configured tool is `/Send an email (V2)`, the orchestrator silently skips that step. The pipeline completes all child agent processing but fails to execute the tool call — no error, no diagnostic, just incomplete execution.

**Prevention:** During the Build phase, cross-reference every `/ToolName` in instructions against the actual `modelDisplayName` values in the workspace's action YAML files. Read the files before writing references. This is especially important for email tools — "Send an email (V2)", "Send an email from a shared mailbox (V2)", and "Send an email (V4)" are all different tools with different capabilities and names.

## Drafter-Evaluator Knowledge Mismatch

**Designing a compliance evaluator that checks rules the drafter doesn't know about.** If the evaluator enforces "required disclosures must be present" but the drafter's instructions and knowledge sources don't list those disclosures, every draft will fail compliance on the first attempt. Adding a revision loop doesn't fix this — it just burns extra turns before the same failure.

**Fix:** Embed the actionable requirements from your compliance rules directly into the drafter's instructions. The drafter doesn't need the full rule set — it needs the **output requirements** that the evaluator will check:

- Required disclosure text (data handling statement, org contact details, consequence statements)
- Permitted phrasing constraints ("aim to" not "will" for timescales)
- Prohibited content categories (internal system names, confidence scores, other applicants)

**Design principle:** Every rule the evaluator checks must have a corresponding requirement the drafter knows about. If you add a new compliance rule, update the drafter's instructions in the same change.

## Retry Loop Token Inflation

**Adding retry/revision loops that duplicate full tool references.** Each `{System.Bot.Components.Agents.'...'.DisplayName}` reference is ~80-100 characters. A retry loop that re-calls a drafter + evaluator pair adds ~200 chars of tool references alone, plus conditional logic and failure paths. In a pipeline that is already near the token budget, this can push the agent into `SystemError` from turn 1 — even though the retry logic never executes.

**Key insight:** The orchestrator's token budget includes the full instruction text at every turn, not just the stages that execute. A retry loop that would only fire on compliance failure still costs tokens on every turn.

**Fix options (pick one):**

1. **Rely on first-pass compliance.** Embed compliance requirements into the drafter so drafts pass on the first attempt. Remove the retry loop entirely. This is the most token-efficient approach.
2. **Compress the retry reference.** Instead of duplicating full tool references, write: "If FAIL: repeat Stage 6 then Stage 7 once more with revision instructions. On second failure, escalate." This relies on the orchestrator resolving stage numbers back to tool references — less explicit but saves ~300 chars.
3. **Move to a CPS workflow.** If the pipeline genuinely needs retry logic with multiple child agents, a workflow YAML (`kind: workflow`) with `GotoAction` loops is more token-efficient than encoding loops in instruction text.

**Budget rule of thumb:** If parent instructions exceed ~5,500 characters (including all tool references and stage definitions), test for `SystemError` on simple inputs before adding any retry logic.

## Verbose Specialist Outputs in Autonomous Pipelines

**Letting specialist child agents return polished narrative responses.** In autonomous pipelines, verbose outputs from child agents are expensive in two ways: they consume context budget and they encourage the orchestrator to surface the output to the user or transcript as if it were final. This is a common cause of `SystemError` and repeated early termination.

**Fix:** Make specialist outputs machine-oriented and compact. Use short labeled blocks for interpretation, verdicts, and revision instructions. Only the final presentation specialist should return full user-facing text — and even then, return the artifact only, with no notes.

## Editing YAML to Satisfy a Design-Time Type Error Without Verifying the Cache

**Rewriting topic or action YAML to make a CPS extension type error go away, without first confirming the type against the live platform schema.** The Copilot Studio VS Code extension type-checks Power Fx expressions against a local cached schema in `<agentFolder>/.mcs/botdefinition.json`, not against the portal. The cache is refreshed incrementally based on `<agentFolder>/.mcs/changetoken.txt` and can go stale when a prompt tool or connector input type changes on the platform. The LSP then reports a type mismatch on YAML that runs correctly in the portal, and Apply Changes refuses to push.

If you edit the YAML to satisfy the stale error, you can introduce a real bug on top of a phantom one — and recovery later requires both reverting the YAML and refreshing the cache.

**Fix:** Before changing YAML in response to a design-time type error, verify the live schema in the portal and refresh the local cache. See `troubleshooting.md` → Stale Local Schema Cache (`.mcs/botdefinition.json`) for the non-destructive `changetoken.txt` re-fetch and escalation path. Local CPS/LSP diagnostics are not authoritative for portal-owned schemas.

## Removing and Re-Adding Connector Actions in Power Automate Designer

**Deleting a connector action (e.g., "Add a new row") in the Power Automate designer and re-adding it.** The portal does not cleanly remove the action — it replaces it with an empty `For_each` loop and sets downstream variable references to placeholder values (e.g., `"hello"` instead of the actual output reference). All `runAfter` dependencies on the deleted action are repointed to the `For_each` loop.

**Symptoms after re-adding:**

- Flow compiles but produces wrong data (placeholder values instead of actual record IDs)
- Downstream SetVariable actions reference a `For_each` that iterates over nothing
- The new connector action may have different field mappings than the original

**Prevention:**

1. **Export/backup workflow.json before editing flows in the portal.** Use Get Changes to pull the current state locally.
2. If you must remove a connector, note all field mappings, `runAfter` dependencies, and downstream variable references before deleting.
3. After re-adding, verify every downstream action's `runAfter` and value references manually.
4. Prefer editing the flow in VS Code and using Apply Changes to push to the portal — this preserves the exact structure.

**Recovery:** If portal editing has damaged the flow, restore from the local workflow.json backup. The local file can be the correct version — but Power Automate is the source of truth for flows, so you must re-apply the fix either through Apply Changes or by manually recreating the correct structure in the PA designer.

## Knowledge Configuration Anti-Patterns

**Putting `.md` / `.json` / `.txt` knowledge packs in a SharePoint library.** SharePoint knowledge only retrieves DOC/DOCX, PPT/PPTX, PDF — the other files are silently never used. Ship those packs through the uploaded-files path (Dataverse), or convert to PDF/DOCX first. See `knowledge-sources.md → Critical Gotcha: Markdown / JSON / TXT in SharePoint Libraries`.

**Giving retrieval advice without checking orchestration mode.** Generative orchestration is the default, and selection is description-driven; classic-style "bind a topic to a source" fixes do not apply. Always establish the mode first. See `knowledge-configuration.md → Orchestration mode is the primary variable`.

**SharePoint-grounded agent with Work IQ prerequisites unmet.** Without an M365 Copilot license + assigned user + semantic index + Microsoft Entra auth, SharePoint retrieval falls back to weaker search and large files may not be usable. Mistaking this for a document-structure problem wastes hours. See `retrieval-internals.md → Work IQ / semantic index`.

**Fixing missing tools or sources with instructions.** Instructions like "search the policy library" don't help when the source/tool is not configured or not eligible under the orchestration mode. Configure the source explicitly.

**Overlapping source descriptions under generative orchestration.** Generative orchestration may select multiple sources/topics/tools for the same intent and produce duplicate or confused answers. Make descriptions mutually exclusive and add "do not use this source for…" wording.

**Deploying unstructured knowledge without post-deployment validation.** ALM does not automatically process OneDrive / Upload-SharePoint knowledge sources after import. The imported agent looks valid but knowledge was not processed in the target environment. Always include a post-deployment knowledge validation task.

**Using preview / experimental models in production knowledge agents without explicit risk acceptance.** Preview models can vary in quality, latency, message consumption and data residency / cross-geo behaviour.

**Treating knowledge "Ready" as "working".** "Ready" means available for testing, not working. Unstructured sources may flip Ready → In Progress → Ready during processing; sensitivity-labelled or oversized files show Ready but never answer. Always run a positive retrieval test.

**Designing a SharePoint knowledge agent that depends on document-library metadata.** Metadata columns are not reliably retrieved as body content. Move important metadata into the document body, or use SharePoint Lists / Dataverse / Azure AI Search with indexed metadata fields.

**Uploading CSV / Excel and expecting BI-style answers.** Knowledge retrieval is not a query engine. Use Dataverse / SQL / API / Power Automate / custom tools for calculations, totals, comparisons or ranking.

**Asking an agent to "review every policy" / "score the whole library".** Knowledge retrieval is query-driven, not batch document processing. If the use case says "all documents", recommend a batch architecture with results stored in Dataverse / SQL / SharePoint List, then let the agent query the results.

**Capturing the generated answer in a variable and rendering it manually.** Citations are typically dropped when the answer is reformatted through adaptive cards or custom output. Use default generative-answer rendering, or explicitly include citations when customising.

**Testing only as the maker.** Permissions and channel auth fail differently for normal users. Always test as a regular end user in the final channel, not only the test pane.
