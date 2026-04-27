# CPS Pipeline Patterns

Patterns for building deterministic specialist pipelines in Copilot Studio. Complements `multi-agent-patterns.md` (which covers agent-to-agent orchestration) with topic-level structural patterns.

---

## Topic-Owned Linear Pipeline

When specialists are implemented as prompt tools (see `multi-agent-patterns.md` → Prompt Tools Over Child Agents), a single `AdaptiveDialog` topic owns the entire pipeline and invokes each specialist in a fixed order. There is no generative orchestration between stages; the topic is deterministic control flow, the prompt tools are pure transformation steps.

### Why topic-owned over agent-owned

- **Deterministic execution order.** No planner re-routing between stages. Stage N always runs after stage N-1.
- **No summarisation layer.** Generative orchestration summarises child agent responses; prompt tools do not.
- **Predictable variable scope.** Each stage's output lands in a known `Topic.` variable and is available verbatim to subsequent stages.
- **Single-place debugging.** The whole pipeline lives in one topic YAML; tracing is linear.

### Four-action specialist pattern

Every specialist stage follows the same four actions:

```
SendActivity          (progress message to user)
InvokeAIBuilderModelAction
    predictionOutput -> Topic.RawX
SetVariable
    Topic.XText = Text(ParseJSON(JSON(Topic.RawX)).text)
SetVariable
    Topic.XBlock = Concatenate("X_RAW", Char(10), Char(10), Topic.XText)
```

Three reasons this works:

1. **`predictionOutput` is the only reliable output binding** across prompt tool schema changes. Named output bindings require portal refresh after schema edits and can silently stale. `predictionOutput` + `Text(ParseJSON(JSON(...)).text)` is the working extraction pattern. See `troubleshooting.md` → Prompt Tool Output Binding Staleness.
2. **Labeled raw blocks** (`X_RAW` prefix) give the downstream assembly step structurally recognisable chunks that survive orchestration context accumulation. See `multi-agent-patterns.md` → Output Preservation Pattern.
3. **Progress `SendActivity` messages** give the user feedback during long pipelines and become echo nodes for free during iteration (see `troubleshooting.md` → Pipeline Debugging with Echo Nodes).

### Pipeline shape

```
User trigger
  │
  ├─ Preprocessing (file → text, if needed)       → Topic.DocText
  ├─ Specialist 1 (prompt tool)                    → Topic.S1Block
  ├─ Specialist 2 (prompt tool)                    → Topic.S2Block
  ├─ Specialist 3 (prompt tool)                    → Topic.S3Block
  │         ...
  ├─ Validator (prompt tool)                       → Topic.VBlock
  ├─ Reporter / assembly (prompt tool)             → Topic.Report
  └─ SendActivity Topic.Report
```

Each specialist consumes the prior blocks it needs (passed as prompt tool input parameters), produces its own labeled block, and the Reporter consumes the set.

### When to use this pattern

- The pipeline produces structured output with strict formatting requirements
- All specialists would otherwise be child agents with no independent tools or knowledge
- Detail preservation across stages is business-critical
- The pipeline runs in a single user turn (not across long-lived autonomous state)

### When NOT to use this pattern

- Specialists need their own tools, knowledge sources, or independent governance — use child agents
- Specialists need to be reused across parent agents — use connected agents
- The pipeline spans multiple user turns with complex state — use topics with variables or an agent flow

---

## Supplementary Pipeline Patterns

### Disclosure Inventory Pre-Scan

When a pipeline performs compliance or regulatory assessment against a document, pre-scan the document content for existing disclaimers, disclosures, and compliance statements before running the compliance assessment step. Build a structured `DISCLOSURE_INVENTORY` and pass it as input to the compliance specialist.

Without this, compliance tools classify already-present disclosures as "Missing" — a persistent false-positive pattern that degrades trust in the output.

```
Preprocessing → Document HTML
    → Pre-scan: extract existing disclaimers → DISCLOSURE_INVENTORY
    → Compliance Assessment (document_html + DISCLOSURE_INVENTORY)
```

### Two-Phase Assessment and Enrichment

For regulatory or citation-heavy domains, split assessment into two sequential prompt tools:

1. **Assessment phase** — flags statements, classifies issues, produces raw findings
2. **Enrichment phase** — validates and enriches citations, adds specific rule references, structures as JSON

This separation improves citation accuracy. A single combined step tends to default to generic rule references (e.g. citing the parent regulation instead of the specific sub-provision). The enrichment phase, receiving the raw findings as structured input, can focus entirely on citation precision.

### "Not Verified From This Input" Pattern

When a pipeline converts documents from their original format (PDF/DOCX → HTML/text) for analysis, some assessment criteria depend on the original visual format — colour contrast, line lengths, visual hierarchy, layout spacing. These cannot be reliably assessed from text-converted content.

Rather than guessing or falsely marking such criteria as Met/Not Met, instruct specialist tools to output: **"Not verified from this input — manual review of original document required."**

This prevents false confidence in scores derived from format-dependent criteria and makes the pipeline output honest about its limitations. Include a document metadata block (original format, page count, image count) so specialists know what the original source was.

### Preprocessing uploaded files

If the pipeline consumes uploaded documents, add a preprocessing prompt tool (code interpreter enabled) as the first stage that converts the file to text, HTML, or Markdown before passing to specialists. Do not assume downstream prompt tools can reason over raw binary file references.

Remember the code interpreter sandbox is stdlib-only (see `constraints.md` → Code Interpreter). Document-to-text conversion must work with `json`, `re`, `string`, standard archive / XML libraries, etc. — no `pandas`, no `bs4`.

### Variable scope

- **Global** scope for pre-processing outputs that must survive topic handoff (file text, session-level context).
- **Topic** scope for intermediate specialist outputs (`Topic.S1Block`, `Topic.S2Block`, `Topic.Report`). These do not need to persist beyond the pipeline turn.

### Validator stage

Place a validator prompt tool between the last specialist and the Reporter. See `multi-agent-patterns.md` → Evaluator / QC Agent for the full responsibility list (arithmetic, structural completeness, cross-specialist conflict, summary-vs-detail accuracy, threshold classification, placeholder detection). The validator emits a structured pass/fail block that the Reporter includes in the final artifact even when all checks pass.

### Reporter stage

The final prompt tool owns the output artifact. This is where the version stamp, fixed headings, and literal template live — not in the topic or agent instructions. See `prompt-engineering.md` → Output Format Ownership Lives at the Production Point.

---

## Related Patterns

- Prompt Tools Over Child Agents — `multi-agent-patterns.md`
- Summary/Detail Pattern — `multi-agent-patterns.md` → Specialist Summary/Detail Pattern
- Output Preservation with Labeled Blocks — `multi-agent-patterns.md` → Output Preservation Pattern
- Evaluator / QC Agent — `multi-agent-patterns.md` → Evaluator / QC Agent
- Echo Nodes for Debugging — `troubleshooting.md` → Pipeline Debugging with Echo Nodes
- Output Format Enforcement — `prompt-engineering.md` → Output Format Enforcement
