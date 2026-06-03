# CPS Troubleshooting

For curated external YAML examples and schema references, see `reference-library.md` and `reference-patterns.md`. Use them to recognize patterns faster, but validate changes against real exported YAML from your environment.

## Agent Calls the Wrong Tool/Topic

1. Check the description — is it specific enough? Does it overlap with another tool's description?
2. If two tools overlap, restrict one to explicit invocation (clear "Allow agent to decide dynamically")
3. Check if the agent has too many tools (>25-30). Consider child agents to partition.
4. Check conversation history — the orchestrator uses context from previous turns which may bias routing.
5. Test in a fresh conversation vs ongoing — routing may differ.

## MCP Tool Appears Enabled But Subtools Are Missing

MCP subtools are portal/runtime-discovered. The subtool list may be visible in the Copilot Studio UI but absent from exported action YAML, `connectionreferences.mcs.yml`, or `.mcs/botdefinition.json`. Do not try to repair this by hand-authoring `knownTools` or changing `action.operationDetails`.

Validation gates for MCP tools:

1. Action YAML exists and has the expected `modelDisplayName`.
2. Tool appears in Copilot Studio.
3. Tool is enabled and has no portal errors.
4. Expected MCP subtools are discovered in the portal/runtime.
5. Activity Map shows runtime execution of the intended subtool.

If the tool is enabled but subtools are missing, use the portal workaround. The current Dataverse MCP install requires this exact sequence (each step followed by Save):

1. Disable the MCP tool, Save.
2. Disable the MCP subtools, Save.
3. Enable the MCP tool, Save.
4. Refresh tools — subtools appear — Save.

After that, run Get Changes, validate exact `/ToolName` references, and test again in Activity Map. The earlier shorter “off → refresh → on” remediation is no longer sufficient for Dataverse MCP.

## Agent Ignores Knowledge Sources

1. Check knowledge source status on the Knowledge page — is it "Ready"?
2. Check indexing — recently added files take 5-30 minutes.
3. Check file size — without M365 Copilot license, SharePoint files >7 MB are silently ignored.
4. Check user permissions — the agent only surfaces content the signed-in user can access.
5. Check the knowledge source description (>25 sources triggers description-based filtering).
6. If using generative orchestration, Conversational Boosting customisations are bypassed.

## Agent Gives Generic/Hallucinated Answers

1. Check if "Allow AI to use general knowledge" is enabled — disable for strict grounding.
2. Add explicit fallback instruction: "If the answer isn't in knowledge sources, say 'I don't have that information.'"
3. Check if generative answers node is properly configured in the relevant topic.
4. Check if documents contain the information the user is asking about (test SharePoint search directly).

## Agent Doesn't Respond in Teams

1. Test pane and M365 Copilot use different pipelines from Teams.
2. Check Teams app permission policies in Teams Admin Center.
3. Check Teams channel is properly enabled and published.
4. Verify a valid Greeting/Conversation Start topic exists.
5. Check all connectors/data sources are accessible to Teams users.
6. Re-add Teams channel, republish, allow time for sync.
7. "Typing then nothing" pattern = usually cold-start throttling or PDF knowledge latency. Migrate PDFs to SharePoint.

## OpenAIMaxTokenLengthExceeded

1. Switch from Activity Map to Transcript view to see the actual error.
2. Common cause: accumulated conversation history in long sessions.
3. Reduce system prompt length.
4. Limit knowledge base context retrieval.
5. Consider resetting conversations after a threshold.

## SystemError in Autonomous Multi-Agent Pipelines

Distinct from `OpenAIMaxTokenLengthExceeded`. In autonomous multi-agent pipelines, verbose/narrative child agent outputs cause a generic `SystemError` at later pipeline stages as accumulated context exceeds the orchestrator's processing capacity.

1. **Compact child outputs first.** Child agents must produce machine-oriented output (key-value pairs, structured data, labeled blocks) not narrative prose. This is the highest-impact fix.
2. **Reduce parent prompt length.** Shorter orchestrator instructions leave more token budget for tool outputs.
3. **If still failing after compaction + reduction:** The next structural step is switching to a CPS workflow (deterministic orchestration) — not more prompt text. Workflows give explicit control flow without the token overhead of generative orchestration planning.
4. Use the Transcript view in the CPS test pane as the primary diagnostic — Activity Map IDs are not queryable via the Dataverse API.

**Escalation path:** Reduce prompts → compact child outputs → if still failing → CPS workflow.

## Connected Agent Returns PluginActionNoOutputSetInEmitMode

A connected-agent YAML using `mode: Generated` parses cleanly, passes Apply Changes, appears enabled in the portal, and **still fails at runtime** with:

```
PluginActionNoOutputSetInEmitMode
The action '<name>' with output mode 'Generate a Message' must have at least one output set.
```

Minimal repro shape:

```yaml
kind: TaskDialog
response:
  activity:
  mode: Generated
modelDisplayName: Digital Twin
modelDescription: ...
action:
  kind: InvokeConnectedAgentTaskAction
  botSchemaName: cr86a_DigitalTwin
  historyType:
    kind: ConversationHistory
```

`mode: Generated` requires at least one declared `outputs:` entry. The fix is **portal-only** — toggle the output mode in the connected-agent edit panel or add an output property in the portal, then Get Changes. Hand-authoring the `outputs:` block is unsafe because the schema is portal-generated.

This is a textbook validation-state-model failure: locally generated, local diagnostics clean, Apply Changes accepted, portal-visible, portal-enabled — none of those gates catch it. Only runtime / Activity Map validation does.

## Connector Tool Added With Incomplete Input Bindings

Adding certain connector actions from the portal (observed with `Microsoft Copilot Studio - Execute Agent and wait`) initially produces an action YAML with only one input bound and the others not declared. Calls fail with `400 Invalid request body`. Fix: edit the tool in the portal and bind a "Dynamically fill with AI" input for each missing field; Get Changes then re-emits the YAML with the full `AutomaticTaskInput` block. Cheap defensive step: **after adding any connector tool, verify every required input has a declared binding before testing.**

## Pipeline Debugging with Echo Nodes

When specialist output is being compressed or structurally degraded between stages and you cannot tell which stage is responsible, insert `SendActivity` echo nodes between stages that emit the raw output with distinctive delimiters:

```
=== RAW <SPECIALIST> ===
{Topic.XText}
=== END RAW <SPECIALIST> ===
```

This makes the exact input and output of each stage visible in the test pane. Compare the delimited blocks across stages to locate where detail is lost (which specialist is producing narrative, which reformatter is stripping structure, which assembly step is summarising). Remove the echo nodes before production release.

This pairs with the labeled raw block pattern (see `multi-agent-patterns.md` → Output Preservation Pattern). The labeled blocks are what the pipeline passes around in production; the echo nodes surface the same blocks in the test pane during iteration.

### Topic-Entry Diagnostics for Handoff Validation

When a topic writes to external systems and is invoked from a parent agent or generative orchestrator, confirm at runtime that the topic was actually entered and that every input was bound before guards or connector actions run. Insert a `dbg_topic_entered` `SendActivity` immediately after the topic's input copy/default nodes and before guards:

```
=== dbg_topic_entered <TopicName> ===
CanonicalId: {Topic.CanonicalIdGuid}
Score:       {Topic.OverallScore}
ReportLen:   {Len(Topic.FinalReportText)}
=== END dbg_topic_entered ===
```

Emit only non-secret IDs, counts, labels, and row keys — never full payloads or PII. If the diagnostic shows the topic was entered but inputs are blank, the orchestrator failed to bind arguments (see `anti-patterns.md` → Using Global Variables as an Invocation Contract). If the diagnostic never fires at all, the topic was never invoked. Remove or gate the diagnostic before production.

## Observable Write Evidence in Success Gates

When a topic writes to external systems, success must be gated on the observable side effect, not on the orchestrator's belief that its plan completed.

- The receiving topic's final user-visible message must include the concrete write identifiers — for example, a SharePoint item URL and a Dataverse row ID — named explicitly.
- The parent orchestrator's success criterion must require all expected identifiers to be present and non-empty in the topic's response before reporting success.
- Partial-success paths must name which write succeeded and which failed; do not collapse partial failure into a generic success message.

Failure signals to watch for in Activity Map and transcripts:

- Orchestrator narrates success while no identifiers appear in the topic response.
- Identifiers appear but are empty strings or placeholders.
- The receiving topic was never invoked (no Activity Map entry) yet the orchestrator reports completion.

As a future enhancement, declaring write identifiers on the topic's `outputType` lets the orchestrator gate on a typed output rather than parsing a natural-language message. See `pipeline-patterns.md` → Topic-Input Handoff Pattern.

## Testing Discipline for Iterative Prompt Work

For agent pipelines under iteration, ad-hoc testing is the fastest way to lose track of what works:

1. **Hold the test document constant across consecutive iterations** to isolate prompt-change effects from document-change effects. Periodically swap in a different document to expose coverage gaps that the primary test document hides.
2. **Version stamp every run.** Without version stamps in the output, debugging "it worked yesterday" regressions is guesswork. See `prompt-engineering.md` → Output Format Ownership for where to put the stamp.
3. **Track a version → score → summary table** to make regression trajectories visible.
4. **Expect regressions in ~20% of releases.** Common causes: instruction accumulation, platform model updates, portal edits reverting local state, prompt tool schema changes breaking bindings, unsupported platform features (e.g. external libraries in code interpreter).
5. **Define the scoring rubric before the first live test**, not after. Retrofitting a rubric to already-produced output biases the evaluation.

## Child Agent Loops

1. Add explicit closing instruction: "End conversation and return to parent after completing the task."
2. Track completion with a variable on the parent side.
3. Check if the issue started after October 2025 update (known regression with Send Email V2).
4. Use "Run once" option on the child agent.

## Connected Agent Response Is Summarised/Truncated

1. This is by design — the orchestration layer summarises for consistency and security.
2. Try adding instruction on parent: "Return connected agent responses exactly as received including all links."
3. Try child agents instead of connected agents (slightly less summarisation).
4. For full fidelity, expose sub-agent logic as a custom tool/API.

## Foundry Agent Works in Foundry but Fails After Copilot Publish

If the same prompt works reliably in Microsoft Foundry but fails only after the agent is connected to or published through Copilot Studio, treat the Azure AI Search index and Foundry retrieval path as provisionally healthy. The fault is usually at the Copilot Studio/Foundry boundary: connected-agent auth, network reachability, version binding, output shape, or parent-orchestrator summarisation.

**Fast isolation path:**

1. Test a non-retrieval prompt through the published Copilot agent: "Reply with exactly: Foundry connection OK." If this fails, diagnose connection, auth, network, or agent ID/version binding before changing search or prompts.
2. Test a deterministic retrieval prompt in Foundry and in the published Copilot surface. If Foundry succeeds but Copilot fails, inspect what the parent receives from the connected agent rather than rebuilding the index.
3. Republish both sides after changes: publish/update the Foundry agent, then refresh or republish the Copilot Studio agent/channel. Connected-agent descriptions and bindings can be stale.
4. Use Copilot Studio Activity Map/Transcript and Foundry traces/logs together. Copilot may show only a generic failure while Foundry confirms successful retrieval and response generation.

**Common causes:**

- Copilot Studio connected-agent runtime cannot access the Foundry project, agent, model deployment, Azure AI Search connection, or private network path used by Foundry testing.
- The connected agent was created in an older Foundry portal/runtime. Copilot Studio's Microsoft Foundry connected-agent preview supports agents created in the new Microsoft Foundry portal; older agents may fail with errors such as `404 - Version not found`.
- Copilot is bound to an older Foundry agent version or stale local connected-agent description.
- The Foundry agent returns content that Copilot struggles to broker: large tables, raw CSV/JSON, long citations, tool traces, or very large multi-record responses.
- Parent orchestration summarises or strips citations/links from the connected-agent response by design.

**Workarounds:**

1. Add a Copilot-safe wrapper agent in Foundry. The wrapper calls the working retrieval logic and returns compact plain text only.
2. Constrain connected-agent output: no raw JSON, CSV, markdown tables, or tool traces; max 5 records; ask a clarifying question for larger result sets; keep responses under a defined character budget.
3. If exact row lookup is required, expose an authenticated lookup/API tool that queries Azure AI Search directly and returns only the matched rows, then let the agent summarise.
4. For diagnostics, add a narrow tool or agent that can invoke the target Foundry agent, query AI Search directly, compare results, and report whether the failure is connection/auth/version/output-shape.
5. If the Microsoft Foundry connected-agent preview is unstable for the channel, wrap the Foundry logic behind an A2A endpoint or custom API/connector with explicit auth and observability.

Example Copilot-safe wrapper instruction:

```text
When responding through Copilot Studio, return plain text only. Keep the answer under 1,500 characters. Do not emit raw JSON, CSV, markdown tables, tool traces, or more than five records. If more records match, state the count and ask the user to narrow by ID, category, or date.
```

## Content Filtered Error

1. No diagnostic info available — this is a known gap.
2. Try rewording instructions to indicate the behaviour is expected.
3. Remove complex instructions and add back one at a time to identify the trigger.
4. Check if trigger payloads contain content that could be interpreted as harmful.

## Power Automate Flow Errors

1. Check the flow completed within 100 seconds.
2. Place post-response logic after "Return value(s) to Copilot Studio" step.
3. Check connector payload size (<5 MB public cloud, <450 KB GCC).
4. If using Dataverse: check valid values for choice columns. Bad values produce HTTP 400 with no useful detail. The Dataverse MCP Server specifically throws a `FormatException` if you pass text labels (e.g. "High") instead of the required integer values (e.g. 100000002). Always include the integer mappings for choice/option-set columns in agent instructions.
5. Use a test Power Automate flow to replay the exact input data and get the real error message.

## Prompt Tool Output Binding Staleness

When a prompt tool's output schema changes, existing `InvokeAIBuilderModelAction` nodes in topics may not pick up the new output bindings.

1. Try deleting and re-adding the action node in the portal, then sync the YAML locally.
2. If re-adding still does not resolve the issue, fall back to `predictionOutput` with client-side JSON parsing. Capture the full response via `predictionOutput: Topic.PredictionOutput`, then use `Text(ParseJSON(JSON(Topic.PredictionOutput)).fieldName)` to extract fields.
3. The `predictionOutput` approach is the most reliable pattern regardless of schema state. Prefer it over named output bindings for any new development.

See `yaml-syntax.md` for the full `InvokeAIBuilderModelAction` YAML structure and Power Fx parsing patterns.

## Autonomous Pipeline Breaks into Interactive Mode

Symptom: the orchestrator prompts the user for values it should already know (e.g. "Could you please specify the direction of the correspondence?").

1. **Most common cause:** Missing input descriptions on "Dynamically fill with AI" inputs. Check every `AutomaticTaskInput` on the failing connector action — if any lacks a description, the orchestrator may prompt for ALL fields.
2. **System fields exposed as dynamic inputs.** Check for Import Sequence Number, Time Zone Rule Version Number, UTC Conversion Time Zone Code, Owner, Status Reason. Remove or set to custom values.
3. **Primary key exposed as dynamic input.** The orchestrator cannot generate a GUID. Set to custom value `GUID()`.
4. **Missing choice column integer mappings in input descriptions.** The orchestrator passes text labels instead of integers.
5. **Phantom field references in modelDescription.** If `modelDescription` mentions a field that doesn't exist as an input, the orchestrator gets confused and prompts for other fields. Audit modelDescription against actual inputs.

**Diagnostic:** Check the orchestrator's reasoning trace (Transcript view). If it shows the correct value but still prompts the user, the problem is at the input configuration layer, not the prompt.

## Dynamic Connector YAML — "Input Binding Not Found"

Dynamic connectors (SendEmailV2, Dataverse Create/Update/List rows) produce "Input binding not found, refresh this flow" errors in the CPS extension when edited in YAML. These connectors don't declare input schemas locally — the schema is resolved at runtime from the platform.

1. Push a skeleton with `input: {}` via Apply Changes.
2. Wire input bindings in the portal canvas.
3. Get Changes to pull the portal-generated bindings into local YAML.

**Corollary:** `item/cr85a_fieldname` syntax in `BeginDialog` for Dataverse Record-type inputs compiles locally but is flagged "not found" by the extension — same dynamic schema issue. Portal-bound `item.'cr85a_*'` ManualTaskInput entries work at runtime; hand-authored ones do not.

**Other observed LSP error strings on dynamic connector schemas** (same root cause — local diagnostics not authoritative for portal-owned schemas):

- `File Content is of incorrect type: Unspecified`
- `Input variable 'Item' is of incorrect type`
- `Output variable 'Response' is of incorrect type: UnresolvedDynamicType`

**Validation hierarchy** for dynamic connector schemas, in increasing order of authority:

1. YAML parse (local).
2. `Apply Changes` succeeds.
3. Portal-visible action with bound inputs.
4. Activity Map shows the action executing at runtime.
5. Real external side effect (row created, file uploaded, email sent).

Do not refactor YAML to satisfy a level-1 or level-2 error without first checking the portal. See also: Stale Local Schema Cache (`.mcs/botdefinition.json`) below, and `anti-patterns.md` → Editing YAML to Satisfy a Design-Time Type Error Without Verifying the Cache.

## Stale Local Schema Cache (`.mcs/botdefinition.json`)

The Copilot Studio VS Code extension stores a local snapshot of connector and AI Builder model schemas in `<agentFolder>/.mcs/botdefinition.json`. The design-time LSP type-checks Power Fx expressions against that cache, not against the portal. The cache is refreshed incrementally based on `<agentFolder>/.mcs/changetoken.txt`. When a prompt tool or connector input type changes on the platform (for example, a prompt upgraded from String to File input), the change-token-driven incremental fetch can fail to pick up the new type, leaving the cache permanently stale. The LSP then reports a type mismatch on YAML that runs correctly in the portal, and Apply Changes refuses to push.

**Symptom triplet to recognise:**

- A topic or action YAML reports a design-time type error in VS Code (for example, `Input variable 'Document_20input' is of incorrect type: File`).
- The same YAML has been observed to run correctly via the portal or test pane.
- The local YAML has not been edited since the last successful run, but `.mcs/changetoken.txt` or `.mcs/botdefinition.json` was written recently.

When all three hold, the YAML is innocent and the cache is wrong.

**Resolution order:**

1. **First response (non-destructive).** Delete `<agentFolder>/.mcs/changetoken.txt` and run `Copilot Studio: Get changes`. The extension rebuilds `botdefinition.json` from a full fetch and the design-time error clears without modifying YAML.

   ```powershell
   Remove-Item "<agentFolder>\.mcs\changetoken.txt"
   # then in VS Code: Copilot Studio: Get changes
   ```

2. **If a full re-fetch does not clear it.** Make a trivial edit to the source prompt tool or connector in the portal (for example, add and remove a space in the description), save, then run `Get changes` again. Some cache pipelines key off the source object's modified timestamp.
3. **Last resort.** Delete `<agentFolder>/.mcs/` entirely and re-open the agent through the extension. Guaranteed fresh cache, but more disruptive (loses any other locally cached state).

**Do not** rewrite the offending YAML to satisfy the LSP unless you have first confirmed the type against the live platform schema. A prior "refactor" commit may have already mutated the YAML in response to a stale cache, in which case recovery requires both reverting the YAML and refreshing the cache. See `anti-patterns.md` → Editing YAML to Satisfy a Design-Time Type Error Without Verifying the Cache.

Local CPS/LSP diagnostics are not authoritative when the cache is suspect — use the validation hierarchy in Dynamic Connector YAML above.

## Composite Connector Payload Round-Trip Fragility (field observation)

> Field observation from a single environment. Not yet reproduced in a second exported agent — treat as a diagnostic checklist item, not canonical platform behaviour.

In at least one observed build, `Copilot Studio: Get changes` rewrote a working composite `item: |- =\{...\}` Power Fx record payload on a SharePoint "Create item" / Dataverse "Add a new row" connector node back to flat `item.<column>` bindings. The flat form then failed to compile or failed at runtime against the connector's expected shape.

**Symptoms:**

- A connector node worked before Get Changes; after Get Changes it fails with a binding or type error.
- Diff shows `item: |- =\{ '@odata.bind': ..., ... \}` replaced by individual `item.<column>` `ManualTaskInput`/`AutomaticTaskInput` entries.
- Reverting only the YAML restores runtime behaviour without portal changes.

**Diagnostic checklist:**

1. After every `Get changes` that touches a SharePoint Create item or Dataverse Add row node, diff the action YAML.
2. If a composite `item: |- =\{...\}` payload was replaced by flat `item.<column>` bindings, test the node before assuming the new shape is correct.
3. Prefer portal-owned binding metadata where possible; preserve locally validated action-body expressions only when they have been runtime-tested.

This observation is environment- and connector-shape-specific. If you cannot reproduce it on a fresh export, treat the original report as a one-off and do not generalise to all dynamic connectors. Related: Dynamic Connector YAML — "Input Binding Not Found" above.

## Power Fx Record Literals for `@odata.bind` and String Coercion (field observation)

> Field observation. These are general Power Fx behaviours surfacing through CPS connector binding, not CPS-specific rules. Verify in a second exported connector node before treating either pattern as required.

When authoring Power Fx record literals inside connector action bodies that target Dataverse, two coercion patterns have been observed to be required:

- **Quoted `@odata.bind` keys.** Record literal keys that contain special characters (such as `@` or `.`) follow the general Power Fx rule for non-identifier keys and may need to be single-quoted:

  ```
  ={ 'cr85a_owner@odata.bind': Concatenate("systemusers(", Text(Global.OwnerId), ")") }
  ```

  This is general Power Fx syntax for keys with special characters — not a CPS-specific behaviour. If an unquoted variant has been working in your environment, do not change it on the basis of this note alone.

- **`Text()` coercion for GUID and path values into String-typed columns.** When a Dataverse column is typed `String` but the source value is a GUID, integer, or other non-string type, explicit `Text(...)` coercion has been observed to be required to avoid type errors at the connector boundary:

  ```
  ={ 'cr85a_documentidentityid': Text(Global.CanonicalDocumentIdGuid),
     'cr85a_sourcepath':         Text(Global.SharePointItemPath) }
  ```

Before generalising either pattern to all Dataverse record literals, confirm the behaviour in a second exported connector node. Do not re-introduce any framing that suggests Power Fx "drops `@`-keys" — that earlier theory was retracted. If a design-time error appears on a record literal that previously worked, suspect the local schema cache first (see Stale Local Schema Cache above) before rewriting the expression.

## CPS Extension Issues

**"Apply Changes" disappears from Command Palette.** After multiple rapid edits or failed applies, the command may vanish. Fix: `Cmd+Shift+P` → "Developer: Reload Window" to reinitialize the extension. A trivial edit to any `.mcs.yml` file may also kick the diff detection back.

## Conversation Transcripts in Dev/Test Environments

The Dataverse `conversationtranscripts` table exists in dev environments but may have 0 rows even for non-M365-Copilot agents. Activity Map conversation IDs are not queryable via the Dataverse API. Prefer the Transcript view in the CPS test pane as the primary diagnostic tool. See also: M365 Copilot agents do not write Dataverse transcripts at all.

## Inconsistent Responses to Identical Queries

1. LLM non-determinism is normal — identical queries won't always give identical responses.
2. Check if documents were recently changed/moved (partial indexing).
3. Check if different users have different access permissions.
4. Check conversation context — previous turns influence routing and response.
5. Check if the agent is near rate limits.

## UnresolvedDynamicType on Dataverse "Add a new row" Connector

The agent creates a row in one Dataverse table successfully, but the second "Add a new row" call targeting a different table fails. The Activity Map shows the tool was invoked but the connector returned an error. The orchestrator may ask the user for input parameters instead of populating them from context.

**Root cause:** The generic "Add a new row to selected environment" connector resolves its schema dynamically from the `entityName` input. Within a single conversation, it binds to the first table's schema and cannot re-resolve for a different table. The second call fails with `UnresolvedDynamicType` because the connector expects columns from the first table.

**Symptoms:**

- First Add row succeeds; second fails silently or with a connector error
- Agent asks the user for column values (e.g., "What is the Correspondence Name?") instead of populating them from pipeline context
- Activity Map shows the generic "Add a new row" tool being called instead of targeted tools

**Fix:**

1. In the CPS portal, create separate "Add a new row" actions — one per target table. For each, set the `entityName` input to a fixed value (not dynamic).
2. Sync locally via Get Changes. Update `modelDisplayName` and `modelDescription` to be table-specific.
3. **Disable or remove the generic "Add a new row" tool.** If it remains active, the orchestrator prefers it over targeted tools.
4. Update parent instructions to reference the new targeted tool names (e.g., `/Create application record`, `/Log correspondence`).
5. Republish and test.

**Key detail:** Simply renaming the generic tool's `modelDisplayName` is insufficient. The orchestrator may still select it. Pre-bound actions with hardcoded `entityName` are the reliable fix.

## Pipeline Stops After First Child Agent (Autonomous/Trigger-Driven)

The agent is triggered (e.g., by an email), invokes the first child agent successfully, then displays the child's output as the final response. Subsequent stages (other child agents, tool calls) never execute.

**Root cause:** Generative orchestration treats each child agent's response as a potential final answer. Without explicit instructions to suppress display and continue, the orchestrator considers the plan complete after the first meaningful response.

**Symptoms:**

- Activity Map shows only 1-2 child agents invoked out of 5+
- The first child's detailed output is displayed verbatim as the agent's response
- No outbound email sent, no Dataverse logging completed

**Fix:**

1. Add a CRITICAL header above the workflow stages in parent instructions: "Do NOT stop after [first child]. Do NOT display child agent outputs to the user."
2. After each child agent stage, add: "Do NOT show this to the user — immediately proceed to stage N."
3. The final stage should be the only one that produces user-visible output.
4. Republish and test. This fix typically requires emphatic, per-stage repetition — a single top-level instruction is not sufficient.

## connectorRequestFailure When Creating/Updating Dataverse Rows

The agent attempts to add or update a Dataverse row and the connector returns `connectorRequestFailure` with no useful detail about which column caused the error.

**Root cause:** The agent used a column name that doesn't exist in the target table. Common patterns:

- Hallucinated columns (e.g., `cr85a_body` when the actual column is `cr85a_email_body_preview`)
- Generic column names without the schema prefix (e.g., `name` instead of `cr85a_name`)
- Columns from a different table (mixed up which columns belong where)

**Fix:**

1. Include the **exact, exhaustive column list** for every target table in the tool's `modelDescription`. Format: "Columns: cr85a_name, cr85a_status, cr85a_reference_number, ..."
2. Add to the description: "Do NOT invent column names. Use ONLY the columns listed above."
3. Include choice/option-set integer mappings inline: "cr85a_status: New=100000000, In Progress=100000001, Escalated=100000003"
4. If you have multiple tables, put each table's column list in the **corresponding targeted tool's** description — not in the parent instructions (saves instruction character budget).

**Prevention:** The Architecture phase should define per-table column lists. The Build phase should copy these verbatim into each tool's `modelDescription`.

## Autonomous Agent Prompts for Optional Fields Mid-Pipeline

The agent is trigger-driven (email, scheduled) and should run end-to-end without interaction. Instead, it stops mid-pipeline and asks: "Could you please provide the contact number?" or "What is the account number?"

**Root cause:** The flow tool uses `AutomaticTaskInput` for optional fields. The extraction agent returned empty string or null for fields not found in the source data. CPS treats empty/null `AutomaticTaskInput` values as "unresolved" and falls back to user prompting — this is platform behavior that cannot be overridden by instructions.

**Debugging steps:**

1. Check the Activity Map — look for the orchestrator generating a user-facing question instead of calling the flow tool
2. Check the extraction agent's output — are missing fields returned as `""`, `null`, or not present?
3. If missing fields are empty/null, implement the N/A sentinel pattern

**Fix:** See constraints.md → Agent Flow Input Declarations → The N/A Sentinel Pattern:

1. Extraction agent returns `"N/A"` for missing fields (not empty, not null)
2. Flow checks `or(empty(...), equals(..., 'N/A'))` and preserves existing DB values when N/A
3. CPS receives non-empty strings and never prompts

**Testing:** Send a follow-up email that changes only one field (e.g., DOB update). Verify:

- No prompting occurs
- The changed field updates in the database
- Existing values (account number, contact, address) are preserved
- The response email acknowledges only the change, doesn't request additional information

## Autonomous Agent Asks for Required Create-Record Fields

The pipeline fails very early and asks a question such as "What is the applicant's email address?" or "What is the applicant's name?" immediately after the first Dataverse create-record step.

**Root cause:** The workflow tries to create the Dataverse record before the extraction/classification stage has populated the required fields. Even though the trigger contains metadata like sender email, the planner treats the create action as an interactive data-entry step.

**Fix:**

1. Reorder the pipeline: query existing record first, then run extraction, then create the Dataverse row.
2. In the create tool's `modelDescription`, explicitly state where required values come from. Example: "For inbound email triggers, set `applicant_email` to the sender email from the trigger. Do not ask the user for it."
3. Republish and retest.

## SystemError Even After Parent Prompt Reduction

The parent instructions have been shortened, `$select`/`$filter` are in use, and full Dataverse result sets are no longer being passed — but the agent still throws `SystemError`, often around the 3rd or 4th specialist stage.

**Likely cause:** The child agents are still returning long, human-readable responses with headings, explanations, and narrative detail. The parent carries these forward as hidden context, so the token budget still grows rapidly even though the parent prompt is shorter.

**Symptoms:**

- The failure point moves later in the pipeline but remains a `SystemError`
- The Activity Map shows the planner restating workflow stages or prior child outputs in the reasoning pane
- The pipeline reaches Correspondence Drafter or Accessibility Presenter, then fails without a connector-specific error

**Fix:**

1. Change specialist agents to emit compact machine-oriented blocks rather than prose.
2. Add explicit parent instruction: "Child-agent outputs are hidden working notes, not user-visible messages."
3. Add explicit parent rule: "Never quote or repeat a child-agent response to the conversation transcript."
4. For final-stage formatter agents, require: "Return ONLY the final artifact. No notes, no explanation, no commentary."
5. Republish and retest.

**Escalation path:** If the pipeline still fails after both parent reduction and child-output compaction, the architecture is exceeding what generative orchestration can reliably handle. Move the pipeline into an explicit CPS workflow or deterministic topic/action sequence.

## OnError Topic Best Practices

The `OnError` system topic fires when the agent encounters an unhandled runtime error. A well-built OnError topic should:

1. **Capture a timestamp.** Store `Text(Now(), DateTimeFormat.UTC)` in a variable — critical for correlating with platform logs.
2. **Differentiate test vs production.** Use `System.Conversation.InTestMode` to show full error details (message + code) only to makers in the test pane. Production users should see a user-friendly message with just the error code and conversation ID (enough for a support ticket, not confusing).
3. **Log a custom telemetry event.** Use `LogCustomTelemetryEvent` with the error message, error code, timestamp, and conversation ID. Without this, errors in production are invisible — the platform doesn't log OnError details by default.
4. **End cleanly.** Include `CancelAllDialogs` at the end to reset the conversation state and prevent the agent from getting stuck in a broken dialog stack.

### Anti-Patterns

- **Empty or default OnError topic.** The out-of-box OnError just shows a generic "Something went wrong" message with no logging and no diagnostic info. This makes production debugging impossible.
- **Showing `System.Error.Message` to production users.** Error messages can contain internal details (connector names, table names, environment IDs) that shouldn't be exposed. Only show in test mode.
- **Missing telemetry.** Without `LogCustomTelemetryEvent`, errors that happen in production leave no trace. You'll only know something is wrong when users complain.
- **No CancelAllDialogs.** Without resetting the dialog stack, the agent may continue in a broken state for subsequent turns in the same conversation.

## Dataverse MCP Server 403 — "Not Authorized to Access MCP"

When adding the Dataverse MCP Server tool to an agent, the connection fails with:

> The application '7ab7862c-4c57-491e-8a45-d52a7e023983' is not authorized to access MCP.

The Copilot Studio MCP client record doesn't exist in your environment's allowed clients list, even though the docs state it's "enabled by default."

**Prerequisites:**

- Power Platform administrator role
- The environment must be a Managed Environment
- The "Allow MCP clients to interact with Dataverse MCP server" toggle must be on

**Fix:**

1. Power Platform admin center → your environment → Settings → Product → Features
2. Confirm **Allow MCP clients to interact with Dataverse MCP server** is turned on
3. Click **Advanced Settings** — opens the classic Dataverse interface showing "Active Allowed MCP Clients"
4. If the list is empty (no client records were auto-provisioned), click **+ New**
5. Fill in:
   - **Name:** `Microsoft Copilot Studio`
   - **Unique Name:** `<yourprefix>_microsoftcopilotstudio` (e.g. `cr86a_microsoftcopilotstudio`)
   - **Application Id:** `7ab7862c-4c57-491e-8a45-d52a7e023983`
   - **Is Enabled:** Yes
6. Click **Save & Close**

**Finding your publisher prefix:** The Unique Name must start with your environment's publisher prefix or the save will fail with "Export key attribute uniquename for component allowedmcpclient must start with a valid customization prefix." Find it in Power Apps → Settings (gear) → Publishers → check the prefix on your default publisher (e.g. `cr86a_`, `new_`).

**After saving:** Return to Copilot Studio and re-add the Dataverse MCP Server tool. The 403 should be resolved.

---

## Knowledge Bad-Answer Taxonomy

When a knowledge-grounded agent gives a bad answer, classify the failure before troubleshooting. See `knowledge-configuration.md → Bad-answer taxonomy` for the full list. Quick reference:

| Code | Symptom |
|---|---|
| A | No answer — agent says it cannot help |
| B | Generic answer — not grounded in any source |
| C | Wrong source — cites/uses an irrelevant source |
| D | Right source, wrong content — finds doc, misses section |
| E | Right answer, no citation — correct but not auditable |
| F | Citation lost after formatting — variable / adaptive card dropped it |
| G | ContentFiltered — Responsible AI blocked input or output |
| H | Web contamination — used public web / general AI when it shouldn't |
| I | Permission failure — works for maker, fails for users |
| J | Channel failure — works in test pane, fails in Teams / other |
| K | Corpus-wide task failure — asked to reason over all documents |
| L | Stale answer — source changed, sync/index not caught up |
| M | Duplicate answer — overlapping sources selected |
| N | Quota / capacity failure — looks like retrieval, isn't |
| O | Deployment / ALM failure — worked in dev, broken after import |

## Knowledge Retrieval Decision Tree

When the agent did not use the expected knowledge source:

1. **What orchestration mode?** Generative = description-driven; Classic = topic/trigger-driven. Apply the right lever (descriptions vs topic binding).
2. Is the source enabled in the relevant topic/node?
3. Is topic-level config overriding agent-level knowledge?
4. Is "Search only selected sources" needed?
5. Is the source description useful, with "use for" + "do not use for" guidance?
6. Are there too many competing sources?
7. Is the source in Ready state — and did it briefly flip back to In Progress during processing?
8. User authenticated? Has source permission? Graph scopes consented? Runtime sign-in required?
9. SharePoint indexed? Work IQ enabled and prerequisites met?
10. File supported and below size limits?
11. Answer in metadata, images, headers, footers, tables, scanned content?
12. Moderation blocking the answer? General knowledge masking a retrieval failure? Web search contaminating?
13. Is this actually a quota / capacity / runtime-dependency failure?
14. Is this only happening after deployment / import?

## Card: ContentFiltered (Responsible AI)

**Likely causes:**
- User input triggered safety filter.
- Retrieved content triggered safety filter.
- Generated answer triggered output filter.
- Prompt injection or jailbreak-like content detected.
- Attempt to reveal hidden prompts or reproduce copyrighted content.

**Diagnosis:**
- Check Application Insights for `ContentFiltered` events.
- Review the conversation transcript.
- Identify whether the trigger is user input, retrieved content or generated answer.
- Lower moderation level only if appropriate for the risk profile (default is **High**).
- Rewrite knowledge content to avoid unnecessary unsafe examples.
- Add safer response instructions.

Example KQL:

```kusto
customEvents
| where customDimensions contains "ContentFiltered"
| project timestamp, name, itemType, customDimensions, session_Id, user_Id, cloud_RoleInstance
```

**SharePoint transcript gotcha:** SharePoint-grounded responses may **not** appear in conversation transcripts. If the issue involves SharePoint knowledge, use test reproduction, source isolation and telemetry rather than relying only on transcripts.

## Card: Updated the file but agent still gives the old answer (sync delay)

**Likely causes:**
- SharePoint/OneDrive upload-source sync has not completed.
- Status briefly showed Ready before processing moved back to In Progress and back to Ready.
- The source needs refresh/reindexing.
- The old document still ranks higher than the updated one.
- Duplicate old versions still exist.

**Fixes:**
- Wait for the documented sync window (5–30 min uploaded; 4–6 hr SharePoint files).
- Check whether status moved Ready → In Progress → Ready.
- Re-test with exact wording from the updated document.
- Remove or archive old conflicting versions.
- Confirm the final channel is using the latest published version.

## Card: Agent suddenly stops answering / becomes unavailable

**Likely causes:**
- Generative AI message quota reached.
- Trial / developer environment limits.
- Pay-as-you-go or prepaid capacity not configured as expected.
- High-volume testing consumed environment quota.
- Timeout / latency from multiple tools, connectors or MCP servers.

**Fixes:**
- Check environment-level Copilot Studio quotas and billing/capacity plan.
- Check whether failures correlate with load or testing.
- Check connector / MCP / runtime dependency health.
- **Do not misdiagnose quota failures as knowledge retrieval failures.**

## Card: Duplicate or overlapping answers

**Likely causes (under generative orchestration):**
- Multiple topics / tools / knowledge sources selected for the same intent.
- Source descriptions overlap.
- A topic and a knowledge source both answer the same intent.
- Conversational boosting + topic both fire.
- Global fallback overlaps with a more specific source.

**Fixes:**
- Make source and topic descriptions **mutually exclusive**.
- Add "do not use this source for…" wording.
- Consolidate overlapping knowledge.
- Move controlled retrieval into a specific generative answers node.
- Disable or narrow redundant fallback paths.

## Card: Imported agent has broken knowledge (ALM)

**Likely causes:**
- OneDrive or Upload-SharePoint unstructured sources were **not** processed after import.
- Target environment doesn't have the same connections, permissions or auth config.
- Work IQ / semantic index prerequisites differ between tenants/environments.
- Source URLs or connector connections differ.

**Fixes:**
- Run a post-deployment knowledge validation task: confirm knowledge sources are processed and Ready in the target environment.
- Re-run the minimum knowledge test plan in the target channel.
- Test as a normal end user, not only the maker.

**ALM gotcha:** for OneDrive and Upload-SharePoint unstructured knowledge sources, ALM does **not** automatically process the knowledge after import.

## Card: Instruction-only fixes do not work

**Symptom:** the maker adds instructions such as "search the policy library", but the agent still does not use the source.

**Likely cause:** the source or tool is **not configured**, or **not eligible** under the current orchestration mode (e.g. Custom Data / Bing Custom Search / Azure OpenAI under generative orchestration without embedding in a generative answers node).

**Fix:** configure the source/tool explicitly, check eligibility, add or improve descriptions, use a topic / generative-answers node when source binding is required. Do not try to fix missing knowledge configuration with instructions.

## Card: Works for maker, not for users (runtime sign-in)

**Likely causes:**
- User lacks SharePoint access.
- Authentication not configured correctly.
- Missing Microsoft Graph scopes / consent not granted.
- Channel authentication differs from test chat.
- User is a guest / external user.
- End user has not signed in to an unstructured data source or connector.

**Unstructured-data auth gotcha:** all unstructured data sources require user-level authentication. At runtime, users must sign in **before** the agent can query those sources. Single-credential sign-in is not currently supported. **Do not assume the maker's connection is reused for end users.**
