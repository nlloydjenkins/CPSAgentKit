# Agent Architecture

<!-- GHCP generates this from the spec. Do not edit manually unless refining. -->
<!-- Spec and architecture live in Requirements/. Additional docs go in Requirements/docs/. -->
<!-- GHCP: Always read ALL files in Requirements/docs/ before generating or updating this architecture. -->

## Overview

<!-- High-level description of the solution architecture -->

## Agents

<!-- List each agent, its role, and its scope -->

### [Agent Name]

- **Role:**
- **Type:** parent / child / connected
- **Tools:**
- **Knowledge sources:**
- **Key instructions:**

## Routing Logic

<!-- How the parent decides which agent to invoke -->

## Tools & Connectors

<!-- List all tools/connectors, which agent owns each, and what they do -->
<!-- Use standard connector action names where applicable, e.g. 'Microsoft Dataverse - List rows from selected environment'. -->
<!-- Do NOT rename standard connector actions to business-specific labels such as 'Get Incident Status'. -->
<!-- For architectures with 5+ columns (e.g. Run As Identity, Target Tables), include all columns from the spec -->

| Tool | Owner Agent | Purpose | Manual Portal Step Required |
| ---- | ----------- | ------- | --------------------------- |
|      |             |         |                             |

## Tool Descriptions

<!-- CRITICAL: These descriptions become modelDescription values in action YAML.
     With generative orchestration, modelDescription is the PRIMARY routing mechanism.
     Generic platform defaults ("List rows from a table in a Power Platform environment")
     are unusable — write detailed descriptions following this pattern:
     "[What it does]. Call when [specific intents]. Requires [inputs]. Do NOT use for [exclusions]."
     Keep standard connector action names unchanged; describe when to call them rather than inventing function-shaped names.
     For Dataverse connectors: include valid tables, per-table purpose, filterable columns, OData examples. -->

## Applied CPS Constraints

<!-- Record the specific Copilot Studio platform constraints that shaped this architecture.
     Do not leave this generic. Examples: child agents cannot own triggers, MCP tools stay on parent,
     PA flows run as author unless otherwise configured, content moderation is portal-only. -->

-

## Best-Practice Decisions

<!-- Record the repo-guided design choices made for this solution.
     Examples: single-agent vs multi-agent rationale, shared Dataverse CRUD scaffold,
     tool-first instructions, topic-specific knowledge sources, exact routing boundaries. -->

-

## Known Risks / Deferred Exceptions

<!-- Record any remaining CPS risks, tradeoffs, or exceptions that still need review.
     Use this instead of silently preserving a risky design. -->

-

## General Knowledge Stance

<!-- State whether general knowledge is enabled, disabled, or fallback-only, and why. -->

## Knowledge Sources

<!-- How knowledge is distributed across agents -->

| Source | Agent | Description | Type |
| ------ | ----- | ----------- | ---- |
|        |       |             |      |

## Manual Portal Steps

<!-- Things that must be created in the CPS portal, in order.
     Include content moderation level (portal-only — no YAML surface).
     Include shared mailbox Send-As permissions if using Outlook connector. -->

1.

## Autonomous Triggers

<!-- List scheduled triggers if the architecture uses autonomous operations.
     CONSTRAINT: Only top-level (parent) agents can own triggers. Child agents CANNOT.
     If the child agent runs the proactive logic, triggers must be on the parent with delegation. -->

| Trigger ID | Schedule | Operation | Owner Agent | Delegates To |
| ---------- | -------- | --------- | ----------- | ------------ |
|            |          |           |             |              |

## Platform Constraint Validation

<!-- GHCP: Before finalising this architecture, validate these constraint gates: -->
<!-- 1. Are any triggers assigned to child agents? → Move to parent (child agents cannot own triggers) -->
<!-- 2. Do any PA flows handle approvals? → Flag identity governance risk (PA flows run as author) -->
<!-- 3. Are there MCP tools on child agents? → Verify they execute via parent orchestration -->
<!-- 4. Is content moderation specified? → Flag as portal-only in Manual Portal Steps -->
<!-- 5. Does the architecture use general knowledge? → If disabled, note clarifying questions must be topic-implemented -->
<!-- 6. Are tools within the 25-30 per-agent limit? → Split to child agents if exceeding -->

## Reference Documents

<!-- List documents from Requirements/docs/ that informed this architecture -->

| Document | How It Influenced the Architecture |
| -------- | ---------------------------------- |
|          |                                    |

## Build State

<!-- GHCP updates this as the build progresses -->

- [ ] Spec complete
- [ ] Architecture approved
- [ ] Platform constraint validation passed
- [ ] Agents created in portal
- [ ] Tools/connectors configured (portal scaffold)
- [ ] Autonomous triggers configured
- [ ] Knowledge sources uploaded
- [ ] Dataverse tables created
- [ ] Dataverse sample data loaded
- [ ] Agent instructions generated
- [ ] Tool modelDescriptions generated (from § Tool Descriptions)
- [ ] Topic descriptions and YAML generated
- [ ] System topics customised (ConversationStart, Fallback, Escalation, OnError)
- [ ] Trigger descriptions updated
- [ ] Settings coherence validated
- [ ] /ToolName references validated
- [ ] Content moderation set in portal
- [ ] Evaluation test sets created
- [ ] Initial testing complete
- [ ] Iteration complete
