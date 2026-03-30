# External YAML Pattern Library

Practical patterns distilled from `microsoft/skills-for-copilot-studio` and adapted for CPSAgentKit.

Use these patterns to recognize good CPS structures quickly. Validate them against a real export before treating them as implementation guidance.

---

## System Topic Patterns

### OnError Pattern

The external template confirms a strong OnError baseline:

- capture a UTC timestamp with `Text(Now(), DateTimeFormat.UTC)`
- branch on `System.Conversation.InTestMode`
- show detailed diagnostics only in test mode
- show a short user-safe failure message in production
- log `System.Error.Message`, `System.Error.Code`, timestamp, and conversation ID via `LogCustomTelemetryEvent`
- finish with `CancelAllDialogs`

This matches CPSAgentKit guidance and should be considered the preferred error-handling pattern.

### Fallback Pattern

The external fallback template shows a classic `OnUnknownIntent` topic with:

- `priority: -1`
- a branch on `System.FallbackCount < 3`
- rephrase prompts before escalation
- escalation to an `Escalate` topic after repeated failures

Important CPSAgentKit constraint: under generative orchestration, fallback handling is planner-driven and this topic may be bypassed. Use the pattern as a classic-mode reference, not as guaranteed behavior in generative mode.

### Conversation Start / Greeting / Disambiguation

The topic template set is useful for locating common system behaviors quickly:

- greeting or conversation init
- clarification/disambiguation
- search-style topics
- question/FAQ style topics
- citation cleanup or formatting topics

Use these templates to identify likely dialog structures and action ordering. Do not assume the exact content matches the portal export in your environment.

## Action And Tool Patterns

### Connector Action Shape

The external connector-action template is useful because it makes the conceptual structure explicit:

- `kind: TaskDialog`
- input entries split between `ManualTaskInput` and `AutomaticTaskInput`
- human-facing tool routing fields `modelDisplayName` and `modelDescription`
- output declaration
- `action.kind: InvokeConnectorTaskAction`
- `connectionProperties.mode: Invoker`

### CPSAgentKit Safe-Edit Rule

Use the template to understand the shape, then switch back to the exported YAML and only edit the safe fields:

- `modelDisplayName`
- `modelDescription`

Preserve everything else exactly unless the platform has regenerated it for you.

### Connector Metadata Files

The external connector reference files are especially useful when writing tool descriptions because they help answer:

- what operation this connector actually performs
- what input names or parameter concepts exist
- what outputs the tool likely returns

Use that information to improve architecture tool descriptions and local reviews. Do not manually rebuild connector YAML from connector metadata.

## Agent Patterns

### Top-Level Agent Pattern

The top-level agent template highlights the common shape:

- `mcs.metadata.componentName`
- `kind: GptComponentMetadata`
- `displayName`
- `instructions`
- `conversationStarters`
- `aISettings.model.modelNameHint`

In CPSAgentKit, preserve model hints if the export already contains them. Avoid inventing them as a primary configuration strategy.

### Child Agent Pattern

The child-agent template confirms the core routing structure:

- `kind: AgentDialog`
- `beginDialog.kind: OnToolSelected`
- a strong routing `description`
- optional `condition`
- optional `inputType` and `outputType`
- specialist `settings.instructions`

This is useful when reviewing whether a child agent is too vague. If the description does not clearly separate the child from sibling tools or agents, expect routing drift.

## Knowledge Source Patterns

The knowledge templates are lightweight but useful for orientation:

- public website knowledge source shape
- SharePoint knowledge source shape

The value is not the YAML itself. The value is knowing what kind of component to expect and where descriptions may appear. In real projects, source descriptions are what matter most once knowledge volume grows.

## Variable Patterns

The variable template is a minor reference, but it helps confirm that variable definitions are first-class YAML components in the authoring model.

Use it as a naming and shape reminder only.

## Conversion Checklist

When using any external pattern from this library:

1. Find the matching exported CPS file in the real agent.
2. Compare only the conceptual structure.
3. Keep portal-generated IDs, bindings, references, and metadata from the export.
4. Apply the pattern only where it matches a verified CPSAgentKit safe-edit rule.
5. Re-test in the target channel or test pane.

## High-Value External Files

These are the highest-value assets from the external repo for CPSAgentKit reference work:

- `reference/adaptive-card.schema.json`
- `reference/bot.schema.yaml-authoring.json`
- `reference/connectors/shared_office365.yml`
- `reference/connectors/shared_office365users.yml`
- `reference/connectors/shared_sharepointonline.yml`
- `reference/connectors/shared_visualstudioteamservices.yml`
- `templates/topics/error-handler.topic.mcs.yml`
- `templates/topics/fallback.topic.mcs.yml`
- `templates/topics/conversation-init.topic.mcs.yml`
- `templates/topics/disambiguation.topic.mcs.yml`
- `templates/actions/connector-action.mcs.yml`
- `templates/agents/agent.mcs.yml`
- `templates/agents/child-agent.mcs.yml`
- `templates/knowledge/public-website.knowledge.mcs.yml`
- `templates/knowledge/sharepoint.knowledge.mcs.yml`
- `templates/variables/global-variable.variable.mcs.yml`
