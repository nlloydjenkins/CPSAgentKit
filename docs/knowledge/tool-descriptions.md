# CPS Tool Description Patterns

## Why Descriptions Matter

In generative orchestration, the orchestrator selects tools based on their name and description. The description also drives auto-generated questions to collect required inputs. Poor descriptions = wrong tool selection + bad input collection questions.

## Description Template

```
[What the tool does in one sentence].
Call this tool when [specific user intents/scenarios].
Requires [input parameters with expected formats].
Do NOT use for [common misrouting scenarios].
```

## Examples

### Good

"Retrieves the customer's order history from the CRM system. Call this tool when the user asks about past orders, purchase history, or previous transactions. Requires a customer email address or order number. Do not use for creating new orders or processing returns."

### Bad

"Gets order data."

## Input Parameter Best Practices

- Names must be human-readable (the orchestrator generates questions from them)
- Always include a description with format expectations
- Use "Should prompt user" for required inputs the agent can't infer from context
- Use Power Fx validation formulas to constrain inputs (e.g., country codes to 2 letters)

Good: `start_date` — "The first day of the requested leave period (format: DD/MM/YYYY)"
Bad: `dt_start` — (no description)

## Disambiguation

When similar tools exist:

1. Make descriptions explicitly non-overlapping
2. Include "Do NOT use for..." in each description
3. If still misrouting, restrict one to explicit invocation (clear "Allow agent to decide dynamically")

## Tool Response Behaviour

In generative mode, tools return information back to the agent by default for response generation. You can also:

- **Write response with generative AI** — agent crafts contextual response from tool output
- **Send specific response** — templated response with variable insertion
- **Send adaptive card** — rich interactive response

## Dataverse Connector Tool Descriptions

When describing a structured Dataverse connector tool (e.g. "List rows from selected environment"):

- Include the exact schema-name fields it supports for filtering (e.g. `cr86a_surfbreak`, not a shortened or display name).
- If the tool supports OData `$filter`, provide one valid example using the real field name in the description so the planner can construct filters correctly.
- Note the default page size behaviour — Dataverse returns up to 5,000 rows per page. If callers should handle `@odata.nextLink`, say so.
- If the tool should only be used for deterministic structured queries (not natural-language), say "Do NOT use for natural-language data questions" to differentiate it from an MCP tool.

## Tool Count Management

When approaching the 25-30 tool limit:

- Group related capabilities into child agents (each gets own tool limit)
- Use topics for simple logic that doesn't need a separate tool
- Disable tools that aren't needed for every conversation

## Architecture → modelDescription Workflow

**This is the single biggest impact area for CPS build quality.** Platform-generated `modelDescription` values in action YAML are always too generic for routing. Every action YAML pulled from the portal will have a useless default like "List rows from a table in a Power Platform environment." — the orchestrator has no basis to select the right table or construct filters from this.

### The Fix

The architecture document should contain a § Tool Descriptions (or § Dataverse Connector Tool Descriptions) section with **exact** descriptions for each tool. During the Build phase, these architecture-defined descriptions must be applied to the `modelDescription` field in each action `.mcs.yml` file.

### Critical Rules

- `modelDescription` has a **hard limit of 1,024 characters**. CPS silently truncates or rejects descriptions exceeding this. Action descriptions for topic-owned tools can be shorter since the orchestrator doesn't route to them directly.
- `modelDescription` in action YAML is the **only safe field to edit** (along with `modelDisplayName`). All other fields are platform-generated.
- NEVER use `>-` or `|` block scalar syntax for modelDescription — block scalars break tools in CPS. Always use plain inline strings.
- Child agent tool copies have a ` 1` suffix on `modelDisplayName`. Their `modelDescription` should be scoped to the child agent's operations only (not a copy of the parent's description).
- For Dataverse connectors shared across multiple tables: include which tables are valid, per-table purpose, key filterable columns with schema names, and OData filter examples.
- For email connectors: include shared mailbox address, when to call, what to include, logging requirements.

## Connector Action Input Configuration

**Input descriptions are as important as tool-level `modelDescription` for correct autonomous execution.** An undescribed input set to "Dynamically fill with AI" causes the orchestrator to prompt the user for a value — even when it already holds the correct value in its reasoning context. This is the single most common cause of autonomous pipelines breaking into interactive mode.

### Input Modes

The CPS portal exposes three input modes per connector action input:

- **"Dynamically fill with AI"** (`AutomaticTaskInput` in YAML) — the orchestrator infers the value from context using the input's name and description.
- **"Ask the user"** — the orchestrator prompts the user for the value.
- **"Set as custom value"** (`ManualTaskInput` in YAML) — a fixed value (Power Fx expression or literal) used every time.

### Rules for Dynamic Inputs

Every input set to "Dynamically fill with AI" must have a description that tells the orchestrator:

1. **What value to use** — the expected data type, format, and constraints.
2. **Where to get it** — "from the trigger context", "from the Interpret and Assess output", "the reference number created in step 3 or step 4".
3. **"Never ask the user"** — for autonomous pipelines, explicitly state this. Without it, the orchestrator may fall back to prompting.

If ANY `AutomaticTaskInput` on a tool lacks a description, the orchestrator may prompt the user for ALL fields on that tool — even ones that do have descriptions. One missing description poisons the whole tool.

### System Fields Must Be Locked Down

Fields like Import Sequence Number, Owner, Status Reason, Time Zone Rule Version Number, UTC Conversion Time Zone Code, and Return Full Metadata must never be "Dynamically fill with AI". Remove them from the connector action or set to custom values. If any remain as dynamic inputs, the orchestrator asks the user for values it cannot possibly know.

### Primary Key / Unique Identifier

Dataverse "Add a new row" actions often expose the table's primary key as a required dynamic input. The orchestrator cannot generate a valid GUID and will prompt the user. Set the primary key input to a custom value of `GUID()`. Do not confuse with the primary name column (human-readable label) which should remain dynamic.

### Choice Column Mappings in Input Descriptions

Choice (option-set) columns require integer values in input descriptions — not just in agent instructions or `modelDescription`. The input description is what the orchestrator reads when filling dynamic inputs. Always include the full mapping: `"Direction: Inbound=100000000, Outbound=100000001"`.

### Text Column Length Limits

When the orchestrator passes a value exceeding a Dataverse text column's max length, the connector returns HTTP 400. Common when logging email bodies or HTML content. Add truncation instructions to the input description: `"First 900 characters of the email body only. Truncate if longer."` Or increase the column length in Dataverse.

### Display Name Consistency

When the same schema column name (e.g. `cr85a_name`) exists on multiple tables with different display names, the orchestrator confuses them at the input level. Always use the display name as shown in the specific connector action — never schema names. Orchestrator instructions should reference "Application Reference Number", not `cr85a_name`.

### Phantom Field References in modelDescription

If `modelDescription` references a field name that doesn't exist as an `AutomaticTaskInput` or `ManualTaskInput` on the action, the orchestrator gets confused and falls back to prompting the user for other fields. Audit `modelDescription` text against the actual input list after every change. Every field name in `modelDescription` must correspond to a real input on the action.

### Connector Action Input Audit Checklist

Before publishing any agent that uses connector actions autonomously:

1. **Is this input needed by the orchestrator?** If no → remove it or set to custom value.
2. **Is this a choice/option-set column?** If yes → add integer mappings to the input description.
3. **Is this a primary key / unique identifier?** If yes → set to custom value `GUID()`.
4. **Is this a text column with a length limit?** If yes → check expected values fit, or add truncation instructions.
5. **Is the display name unambiguous?** If the same schema name exists on other tables → use the exact display name from this action.
6. **Does the description tell the orchestrator where to get the value?** If no → add source and "never ask the user" for autonomous pipelines.

## Pre-Bound (Table-Targeted) Dataverse Connector Descriptions

When using separate connector actions pre-bound to specific tables (to avoid UnresolvedDynamicType — see constraints.md), each tool's `modelDescription` must include:

1. **The target table's purpose:** "Creates a new application record in cr85a_applications to track an inbound case."
2. **Complete column list:** Every writable column by schema name. The model will hallucinate columns if the list is incomplete.
3. **Choice/option-set mappings inline:** "cr85a_status: New=100000000, In Progress=100000001, Awaiting Applicant=100000002, Escalated=100000003"
4. **"Do NOT invent column names":** Explicit prohibition — the model defaults to plausible-sounding names that don't exist.
5. **Lookup column format:** "cr85a_application (Lookup): use the GUID of the parent cr85a_applications row."
6. **What this tool does NOT do:** "Do NOT use for correspondence records — use /Log correspondence instead."

### Example

"Creates a new application record in cr85a_applications. Use ONLY these columns: cr85a_name (text, required — set to the reference number), cr85a_reference_number, cr85a_applicant_name, cr85a_applicant_email, cr85a_status (choice: New=100000000, In Progress=100000001, Awaiting Applicant=100000002, Escalated=100000003), cr85a_application_type (choice: Change of Tenancy=100000000, ...), cr85a_account_number, cr85a_assigned_queue, cr85a_overall_confidence. Do NOT invent column names not listed above. Do NOT use for correspondences, compliance checks, or extracted fields — use the dedicated tools for those tables."

### Naming Convention

Use descriptive action names, not table names:

- Good: "Create application record", "Log correspondence", "Log compliance check"
- Bad: "Add cr85a_applications row", "Add row 2", "Add row 3"

## Tool Count Management

When approaching the 25-30 tool limit:

- Group related capabilities into child agents (each gets own tool limit)
- Use topics for simple logic that doesn't need a separate tool
- Disable tools that aren't needed for every conversation
- When removing a tool from an autonomous pipeline, also add it to an explicit "Do not call: [tool X], [tool Y]" list in the orchestrator instructions — this prevents the orchestrator from re-discovering disabled tools via description matching

## External Connector Reference Library

The `skills-for-copilot-studio` repo includes connector metadata files under `reference/connectors/`. Use them as a lookup aid when improving tool descriptions:

- inspect operation intent and naming
- identify likely input/output fields
- confirm whether a connector is the right capability at all

Do not generate production action YAML directly from those files. Keep using portal-created actions plus local edits to `modelDisplayName` and `modelDescription` only.
