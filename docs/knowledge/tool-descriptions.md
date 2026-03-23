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
