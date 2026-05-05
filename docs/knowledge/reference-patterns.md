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

Manual child-agent scaffolding is viable when the exported parent folder already exists, no generated child folder exists yet, and CPSAgentKit has a verified child-agent shape. Use a sanitized folder name such as `KnowledgeSpecialist`, keep the display name in `mcs.metadata.componentName`, and require Apply Changes plus portal acceptance before treating the child as fully accepted. If the child needs tools, connector bindings, knowledge sources, MCP servers, prompt tools, flows, or portal-only settings, Build must create those child-owned artifacts whenever CPSAgentKit has a verified export/API pattern for that exact artifact and required tenant bindings are available; action YAML additionally requires real connection reference logical names. Portal-first is only the fallback when no verified path exists. Child-owned artifacts require a two-pass ParentId-safe order: first apply the child shell; after Get Changes confirms the child cloud component exists, apply child-owned artifacts.

Do not place active child-owned `.mcs.yml` files under a newly scaffolded child folder before the child exists in the cloud. Apply Changes can fail with `ParentId does not exist on cloud: <schema>.agent.<Child>` when Copilot Studio tries to create child-owned tools before the child botcomponent exists. Stage child-owned YAML as `.mcs.yml.staged` or in a non-applied staging location during the first pass, then rename it to `.mcs.yml` for a second Apply Changes pass after Get Changes confirms the child.

### Action Pattern

Action YAML is stricter than child-agent YAML. A minimal manual `TaskDialog` stub can pass diagnostics only when it includes `action.connectionReference`, and reliable portal acceptance also requires a root `connectionreferences.mcs.yml` containing the referenced logical names. This is a reference-backed scaffold path: use it only when the artifact shape comes from a known-good export/API pattern and the active workspace contains the real tenant connection reference logical names. Treat the result as provisional until the manual acceptance and runtime validation gates pass.

A validated action shape and operation ID are not enough. Do not create active `.mcs.yml` or staged `.mcs.yml.staged` action files if the active workspace lacks root `connectionreferences.mcs.yml`, exported `actions/*.mcs.yml`, child `agents/*/actions/*.mcs.yml`, or connection-reference logical names in `.mcs/botdefinition.json`. In that case, complete unrelated safe build work first, then checklist the smallest blocker: create/sync the connector or provide a real root `connectionreferences.mcs.yml` with the tenant-specific logical names.

Reference-shaped action files should preserve the portal/export pattern:

- root `connectionreferences.mcs.yml` with `connectionReferenceLogicalName` and `connectorId`
- `kind: TaskDialog`
- inline `modelDisplayName`
- inline `modelDescription` under 1,024 characters
- `action.kind: InvokeConnectorTaskAction` or `InvokeExternalAgentTaskAction`
- `action.connectionReference` matching the root manifest
- connector operation IDs such as `MyProfile_V2`, `PostMessageToConversation`, or `SendEmailV2` where verified by export/reference
- MCP metadata with `operationDetails.kind: ModelContextProtocolMetadata` and `operationDetails.operationId: InvokeMCP`

Before declaring a new action blocked, use the bundled CPSAgentKit reference patterns in this file plus `yaml-syntax.md` and `multi-agent-patterns.md`, then search for validated reference-backed patterns inside the active workspace. Check current-workspace `Reference/`, `Requirements/*tool*yaml*findings*.md`, `Requirements/*product*notes*.md`, `Requirements/*implementation*sketch*.md`, root `connectionreferences.mcs.yml`, exported `actions/*.mcs.yml`, and child `agents/*/actions/*.mcs.yml`. Do not browse unrelated sibling folders or ask the developer to supply an external exported agent — the bundled CPSAgentKit reference patterns above are the authoritative product evidence. A bundled pattern or validated findings file in the active workspace changes the build path from manual portal creation to provisional reference-backed scaffold.

### Seeding When the Active Workspace Has No Exports

If the active workspace has no exported `actions/*.mcs.yml`, no `connectionreferences.mcs.yml`, and no `.mcs/conn.json`, do not stop at a broad blocker and do not fabricate `action.connectionReference` values. Ask the developer for the smallest platform-generated seed:

- For connection reference values, any exported tool using the same connector reveals the tenant `connectionReference` logical name.
- For active action YAML, prefer a reference export of the exact tool, otherwise the same operation family.
- For Dataverse MCP, prefer an exported Dataverse MCP action — a normal Dataverse connector action only proves the connector reference, not the MCP shape (`InvokeExternalAgentTaskAction` + `ModelContextProtocolMetadata` + `operationId: InvokeMCP`).
- For child-agent shells, local scaffolding using the verified `AgentDialog` shape is usually safe without a same-family export. Child-owned tools still require a same-family export or platform-generated seed.

Acceptable seeds are (a) a reference export from the same tenant/environment, or (b) one minimal tool created in Copilot Studio followed by Get Changes. Use the exported literal YAML values to scaffold the remaining tools in that family. The boundary is: do not fabricate connection bindings. It is not: refuse to scaffold tools or agents.

Reusable IT Help Desk first-party tool scaffold:

- root `connectionreferences.mcs.yml`
- parent `actions/MicrosoftDataverse-MicrosoftDataverseMCPServer.mcs.yml` with `operationId: InvokeMCP`
- parent `actions/Office365Users-GetmyprofileV2.mcs.yml` with `operationId: MyProfile_V2`
- staged child `agents/<NotificationSpecialist>/actions/MicrosoftTeams-Postmessageinachatorchannel.mcs.yml.staged` with `operationId: PostMessageToConversation`
- staged child `agents/<NotificationSpecialist>/actions/Office365Outlook-SendanemailV2.mcs.yml.staged` with `operationId: SendEmailV2`

Parameterize agent folder names, Dataverse table and choice mappings, Teams channel and shared mailbox wording, connection reference logical names from the active workspace's root manifest or exported action YAML, and exact `modelDisplayName` values used in slash references. Keep child-owned action files staged until the child exists in the cloud. Treat the created files as provisional until Apply Changes, portal inspection, Get Changes, MCP subtool discovery, and Activity Map execution pass.

Local YAML parsing and diagnostics are necessary but not sufficient. Treat manually scaffolded actions as provisional until Apply Changes succeeds, Get Changes preserves or portal-corrects the action files, Copilot Studio shows the tools enabled with no errors, and Activity Map testing confirms runtime execution.

For MCP actions, add one more gate: expected subtools must be runtime-discovered. The subtool list may not be exported locally, so validate in the portal and Activity Map. If subtools are missing, do not edit `knownTools`; use the four-step Save sequence: disable tool + Save, disable subtools + Save, enable tool + Save, refresh tools (subtools appear) + Save.

### Topic Scaffold Pattern

Deterministic topic scaffolding is viable for parent-agent routing, asking questions, confirmation, safety checks, and user-facing messages. It is not yet a safe general-purpose way to write MCP or connector execution nodes from scratch.

Use locally scaffolded topics when they only need exported-safe dialog structure. For topic-owned tool execution, require a portal-generated example from the same tenant/environment or a verified template that has passed Apply Changes, Get Changes, and Activity Map execution. Without that, create the topic shell and list the execution node as portal-generated follow-up work.

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

## Validation State Model

When converting patterns into product guidance, separate validation states instead of using a single done/not-done flag:

- locally generated
- local diagnostics clean
- Apply Changes accepted
- portal-visible
- portal-enabled
- runtime-discovered, for MCP subtools and other runtime-owned state
- Get Changes preserved
- Activity Map validated

This prevents local parsing success from being mistaken for runtime readiness.

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
