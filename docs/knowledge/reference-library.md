# External CPS Reference Library

Curated reference guidance based on the `microsoft/skills-for-copilot-studio` repository.

Use this library to accelerate YAML authoring and review in CPSAgentKit. Treat it as a pattern catalog, not as a source of truth.

---

## Decision

- Use the external repo as a **secondary reference** for Copilot Studio YAML patterns.
- Do **not** treat it as authoritative schema.
- Do **not** add it as a runtime dependency.
- Do **not** copy its templates into production YAML without validating against a real cloned agent from your environment.

## Why

The external repo is useful because it collects practical patterns for topics, actions, child agents, knowledge sources, and troubleshooting. It is not safe to depend on as canonical because:

- the repo explicitly describes itself as experimental
- Copilot Studio YAML changes without notice
- some templates are conceptual scaffolds, not portal-verified exports
- real exported YAML from the target environment remains the safest baseline

## What To Use From It

### `reference/adaptive-card.schema.json`

Use for Adaptive Card payload shape checks when building or debugging card JSON.

Good use:

- confirming required Adaptive Card properties
- checking element/property names
- validating card payload ideas outside Copilot Studio

Do not use it to infer CPS topic/action YAML structure.

### `reference/bot.schema.yaml-authoring.json`

Use as a loose catalog of possible CPS YAML shapes and property names.

Good use:

- discovering possible fields during investigation
- sanity-checking whether a property exists in the authoring model
- understanding the breadth of CPS YAML entities

Do not use it as proof that a field is safe to edit locally.

### `reference/connectors/*.yml`

Use to inspect connector operation metadata.

Good use:

- understanding connector operation names and shapes
- finding candidate input/output property names
- improving `modelDescription` text for connector tools

Do not hand-author `connectionReference`, `operationId`, or dynamic schema blocks from these files. Create the tool in the portal first, sync it down, then edit only the safe descriptive fields.

### `templates/topics/*.topic.mcs.yml`

Use as system-topic and orchestration pattern examples.

High-value examples:

- `error-handler.topic.mcs.yml` for OnError structure, test-mode branching, and telemetry
- `fallback.topic.mcs.yml` for unknown-intent fallback and escalation logic
- `conversation-init.topic.mcs.yml` for conversation-start patterns
- `disambiguation.topic.mcs.yml` for routing clarification flows

Do not copy IDs, placeholder dialog names, or topic internals verbatim. Replace any `_REPLACE` placeholders and validate against a cloned topic in the target agent.

### `templates/actions/connector-action.mcs.yml`

Use as a conceptual action shape reference.

Good use:

- understanding `ManualTaskInput` vs `AutomaticTaskInput`
- seeing where `modelDisplayName` and `modelDescription` sit
- understanding the existence of `outputMode: All`

Do not use it to synthesize final action YAML from scratch. In exported CPS YAML, most action fields are platform-generated and untouchable.

### `templates/agents/*.mcs.yml`

Use to understand the difference between top-level agent metadata and child-agent dialog shape.

Useful distinctions:

- top-level agent template uses `kind: GptComponentMetadata`
- child agent template uses `kind: AgentDialog`
- child agents route off `beginDialog.kind: OnToolSelected`
- child-agent `description` is critical for parent routing

Do not assume these templates reflect every field your tenant export will contain.

### `templates/knowledge/*.knowledge.mcs.yml`

Use as a simple pattern reference for knowledge-source component structure.

Best use:

- understanding the high-level shape of public website and SharePoint knowledge definitions
- checking where descriptions live when those descriptions are surfaced in YAML

Do not assume those templates cover every knowledge-source kind or every tenant-specific field.

### `templates/variables/*.variable.mcs.yml`

Use as a lightweight variable-definition example only.

## What Not To Use From It

- Do not vendor the repo into this project.
- Do not install it as a CPSAgentKit dependency.
- Do not generate production YAML purely from its templates.
- Do not use it to justify edits to fields that CPS exports generated for you.
- Do not assume its fallback/topic behavior applies unchanged under generative orchestration.

## CPSAgentKit Usage Rule

When using this reference library inside CPSAgentKit:

1. Start from a real cloned/exported CPS file.
2. Use the external repo only to recognize patterns or missing capabilities.
3. Apply changes only to fields already known to be safe in this codebase.
4. Validate the resulting YAML against real environment behavior.

## Recommended Workflow

1. Clone or sync the real agent from Copilot Studio.
2. Compare the relevant exported file with the matching pattern in this reference library.
3. Apply only the minimum safe change.
4. Re-test in Copilot Studio.
5. Record any verified divergence in this repo's own knowledge docs.

## Current Position In CPSAgentKit

This library exists to improve:

- YAML recognition during build/review work
- system-topic authoring quality
- action/tool description quality
- troubleshooting speed when exported YAML is unclear

It does **not** replace the CPSAgentKit architecture-driven workflow, local review logic, or real exported YAML as the primary build baseline.
