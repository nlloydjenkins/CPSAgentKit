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

## Pipeline Debugging with Echo Nodes

When specialist output is being compressed or structurally degraded between stages and you cannot tell which stage is responsible, insert `SendActivity` echo nodes between stages that emit the raw output with distinctive delimiters:

```
=== RAW <SPECIALIST> ===
{Topic.XText}
=== END RAW <SPECIALIST> ===
```

This makes the exact input and output of each stage visible in the test pane. Compare the delimited blocks across stages to locate where detail is lost (which specialist is producing narrative, which reformatter is stripping structure, which assembly step is summarising). Remove the echo nodes before production release.

This pairs with the labeled raw block pattern (see `multi-agent-patterns.md` → Output Preservation Pattern). The labeled blocks are what the pipeline passes around in production; the echo nodes surface the same blocks in the test pane during iteration.

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
5. [YOUR CONNECTED AGENT FIX FINDINGS GO HERE]

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
