# CR005 - Brand Editor Build Feedback Review

Source: Multi-session build of Coutts Brand Editor agent using CPSAgentKit knowledge base and CPS VS Code extension.

---

## Review Summary

The feedback covers three areas: what worked well (validation), knowledge base gaps, and build issues encountered. Each item is reviewed below with a decision on whether it warrants a change to the extension or knowledge base.

The recently added `yaml-syntax.md` knowledge file (sourced from the same project) already addresses several of the gaps identified in this feedback. Those items are marked as resolved.

---

## What Worked Well

These items confirm existing knowledge base content is accurate and useful. No changes needed - retained as validation evidence.

**Knowledge base accuracy.** Constraints, anti-patterns, and multi-agent patterns all proved reliable. No change needed.

**Scaffold-first workflow.** Portal-first, sync-local, refine-in-VS-Code is correctly documented in `constraints.md` under Authoring Workflow. No change needed.

**Block scalar warning.** The `>-` / `|` warning for `modelDescription` is documented in `yaml-syntax.md` and also generalised to HTML values. No change needed.

**CPS diagnostic feedback.** Compilation error accuracy is noted in `yaml-syntax.md` General Learnings. No change needed.

**Tool description guidance.** Thoroughly covered in `tool-descriptions.md`. No change needed.

**MCP child agent limitation.** Documented in both `constraints.md` (Multi-Agent section) and `multi-agent-patterns.md` (MCP Tools Through Orchestration). No change needed.

---

## Gaps in the Knowledge Base

### 1. InvokeAIBuilderModelAction output binding behaviour

Decision: Already resolved.

`yaml-syntax.md` now documents the full `InvokeAIBuilderModelAction` YAML structure including `predictionOutput` as the reliable output binding, the portal metadata refresh requirement for named bindings, and the `JSON() -> ParseJSON() -> .property -> Text()` extraction chain.

### 2. Prompt tool capabilities and limitations (text-only output)

Decision: Include - add to `constraints.md`.

The knowledge base discusses prompt tools as architectural building blocks but does not explicitly state they are text-in, text-out only. This caused a fundamental design pivot during the build. A one-line constraint note would prevent this.

Suggested addition to `constraints.md` under a Prompt Tools heading:
- Prompt tools are text-in, text-out only. They cannot return images, files, or binary content.
- To return structured data, have the prompt return JSON as its text response and parse it downstream using the `JSON() -> ParseJSON() -> .property -> Text()` chain (see `yaml-syntax.md`).

### 3. Power Fx syntax in YAML

Decision: Already resolved.

`yaml-syntax.md` covers the `=` prefix convention, common expression patterns (`If`, `IsBlank`, `Blank()`, `System.Activity.Text`), the `JSON/ParseJSON/Text` chain, and variable scoping. The General Learnings section explicitly states that expressions use `=` prefix while assignment targets do not.

### 4. String encoding guidance

Decision: Already resolved.

`yaml-syntax.md` documents Unicode escape patterns (`\u003C`, `\u003E`, `\u0022`, `\u0027`, `\u0026`), provides examples of HTML in YAML quoted strings, and warns against block scalars for large values.

### 5. inputType / outputType topic-level schema

Decision: Already resolved.

`yaml-syntax.md` documents the `inputType` / `outputType` schema blocks with structure examples showing property definitions with `displayName` and `type` fields.

---

## Issues Encountered During Build

### 1. Output binding staleness

Decision: Already resolved (documentation). No code change needed.

`yaml-syntax.md` documents this under InvokeAIBuilderModelAction Output Bindings: "Named output bindings require the action node's metadata to be in sync with the prompt tool's output schema - this is refreshed only when the action node is deleted and re-added in the portal." The General Learnings section reinforces this further.

However, the feedback notes that even deleting and re-adding did not resolve the issue in their case. This is worth adding as a note.

Suggested addition to `yaml-syntax.md` General Learnings or `troubleshooting.md`:
- If re-adding the action node still does not resolve stale output bindings, fall back to `predictionOutput` with client-side JSON parsing. This is the most reliable approach regardless.

### 2. Prompt tools cannot render visual output

Decision: Include - same as Gap 2 above. Add the text-only constraint to `constraints.md`.

### 3. Compile errors from shared prompt tools (cascading schema changes)

Decision: Include - add to `anti-patterns.md`.

This is a real operational risk not currently documented. When a shared prompt tool's input schema changes, every topic referencing it breaks simultaneously. This should be called out as an anti-pattern or at minimum a risk note.

Suggested addition to `anti-patterns.md` under a new heading:
- Changing a shared prompt tool's required inputs breaks all referencing topics. Before adding required inputs to a shared prompt, audit all calling topics. Wire the new inputs in each topic or remove the action from topics that cannot supply them.

### 4. Record vs Text typing confusion on PredictionOutput

Decision: Already resolved.

`yaml-syntax.md` explicitly documents this: the "What does NOT work" section shows the three common failure patterns, and the "Working pattern" section explains why `JSON()` serialization is needed before `ParseJSON()`. The General Learnings section also states: "Topic.PredictionOutput is typed as a Record in Power Fx, not Text."

---

## Suggested Knowledge Base Additions

### 1. Prompt tool output patterns in prompt-engineering.md

Decision: Do not include in `prompt-engineering.md`.

The YAML-level mechanics (capture via `predictionOutput`, parse with Power Fx) are already in `yaml-syntax.md`. Adding the same content to `prompt-engineering.md` creates duplication. `prompt-engineering.md` covers prompt design strategy, not YAML syntax. Cross-reference is sufficient.

However, a brief note in `prompt-engineering.md` under The Prompt Architecture could reference `yaml-syntax.md` for the implementation pattern. This is a minor improvement, not a priority.

### 2. YAML syntax reference for Power Fx

Decision: Already resolved. This is `yaml-syntax.md`.

### 3. InvokeAIBuilderModelAction YAML structure

Decision: Already resolved. Fully documented in `yaml-syntax.md`.

### 4. Prompt tool output binding staleness in constraints/troubleshooting

Decision: Include. See Issue 1 review above - a brief troubleshooting entry for the case where re-adding the node still fails.

### 5. Prompt tools are text-only

Decision: Include. See Gap 2 review above.

### 6. inputType / outputType documentation

Decision: Already resolved. Documented in `yaml-syntax.md`.

---

## Workflow Comments

These are observations about the CPS platform workflow, not the CPSAgentKit extension. Reviewed for any actionable items.

**Local changes requiring portal-side actions.** This is a platform limitation (output binding refresh requires portal interaction). Already documented in `yaml-syntax.md`. No extension change possible.

**No local preview/test.** Platform limitation. The extension cannot add local testing - CPS requires the portal test pane. No change.

**One-directional sync (no merge).** Valid observation. The extension's sync is get-or-apply with no merge. This is a known design decision - merge would require conflict resolution UI and is out of scope for a knowledge sync tool. No change.

**Large inline values hard to navigate.** Valid observation but no actionable change. `yaml-syntax.md` already recommends using Global variables set once rather than duplicating large values across topics. The underlying issue (CPS requires inline values) is a platform constraint.

---

## Action Items

| Item | Target File | Priority |
|---|---|---|
| Add prompt tool text-only constraint | constraints.md | High |
| Add shared prompt tool schema change risk | anti-patterns.md | Medium |
| Add troubleshooting note for persistent output binding staleness | troubleshooting.md | Low |
| Optional: cross-reference yaml-syntax.md from prompt-engineering.md | prompt-engineering.md | Low |
