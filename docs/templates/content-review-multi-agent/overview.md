# Template: Content Review Multi-Agent

A hub-and-spoke multi-agent architecture for reviewing uploaded documents against a multi-pillar quality framework. Based on a real production deployment.

## What It Does

A user uploads a document (PDF, DOCX). The system converts it, routes it through specialist review agents in sequence, collects scored results, and produces a structured review report. No conversational back-and-forth — the output is a fixed-format artifact.

## Architecture

```
User → Review Orchestrator → File Preprocessor (prompt tool)
                           → Relevance Specialist (child agent)
                           → Clarity Specialist (child agent)
                           → Compliance Specialist (child agent)
                           → Citation Analyst (prompt tool)
                           → Tone Specialist (child agent)
                           → Evaluator Agent (child agent)
                           → Reporter Agent (child agent)
```

### Why This Shape

- **Hub-and-spoke, not chain.** CPS blocks multi-level chaining (parent → child → child's child). All specialists connect directly to the orchestrator.
- **Child agents for review pillars.** Each specialist has its own instructions, knowledge, and tool budget — cleanly partitioned. This avoids hitting the 25-30 tool practical limit on a single agent.
- **Prompt tools for extraction and transformation.** Citation analysis and file preprocessing use prompt tools with code interpreter — the documented CPS path for deterministic file processing and format transformation. Prompt tools provide code interpreter access and temperature control that agent instructions can't. Use them anywhere you need a focused, single-purpose AI call without orchestration overhead.
- **Knowledge on the orchestrator.** Review standards and scoring frameworks are attached as knowledge sources on the orchestrator. The parent retrieves the relevant standards and passes them to each specialist as context. This avoids relying on non-deterministic retrieval inside each child agent for mission-critical criteria.
- **Content-type separation in dual-placement.** Domain rules (criteria, regulatory references, style rules) live in agent instructions — always in context. Assessment methodology (output templates, worked examples, scoring procedures) lives in knowledge files — retrieved during execution. This keeps instructions focused and short.
- **Labeled output preservation.** Each specialist returns a labeled block (e.g., `RELEVANCE_RESULT`, `CLARITY_RESULT`). The orchestrator is instructed to preserve these verbatim rather than paraphrasing — a mitigation for CPS generative orchestration's default summarisation behavior.
- **Evaluator for quality control.** A dedicated Evaluator agent validates all specialist outputs before final assembly — arithmetic consistency, cross-agent conflicts, structural completeness.
- **Reporter for format normalisation.** A dedicated Reporter agent produces the final artifact from validated outputs, applying a fixed structure and deduplicating overlapping findings.

### Component Inventory

| Component             | Type           | CPS Kind               | Authoring     |
| --------------------- | -------------- | ---------------------- | ------------- |
| Review Orchestrator   | Parent agent   | `GptComponentMetadata` | YAML + portal |
| Relevance Specialist  | Child agent    | `AgentDialog`          | YAML          |
| Clarity Specialist    | Child agent    | `AgentDialog`          | YAML          |
| Compliance Specialist | Child agent    | `AgentDialog`          | YAML          |
| Tone Specialist       | Child agent    | `AgentDialog`          | YAML          |
| Citation Specialist   | Child agent    | `AgentDialog`          | YAML          |
| Evaluator Agent       | Child agent    | `AgentDialog`          | YAML          |
| Reporter Agent        | Child agent    | `AgentDialog`          | YAML          |
| Citation Analysis     | Prompt tool    | —                      | Portal-first  |
| File Preprocessor     | Prompt tool    | —                      | Portal-first  |
| Review Request        | Topic          | `AdaptiveDialog`       | YAML          |
| Review Status         | Topic          | `AdaptiveDialog`       | YAML          |
| Escalation            | Topic          | `AdaptiveDialog`       | YAML          |
| Report Delivery Flow  | Power Automate | —                      | Portal-first  |

### Key CPS Patterns Used

1. **File preprocessing before delegation** — raw binary files don't pass reliably through orchestration. Convert first. The preprocessed output is the canonical input for all downstream agents.
2. **Knowledge dual-placement with content-type separation** — domain rules (criteria, regulatory references) in agent instructions (always in context); assessment methodology (output templates, worked examples) in knowledge files (retrieved during execution).
3. **Labeled output blocks** — prevents generative orchestration from summarising specialist results. Each specialist returns a distinctly labeled block that downstream agents reproduce verbatim.
4. **Child completion: "Don't respond"** — children return output variables, not user-facing messages. Parent controls all user interaction.
5. **Final artifact suppression** — orchestrator is told the report is final and must not append follow-up prompts.
6. **Instruction decomposition** — review logic split across focused specialists rather than one large instruction block.
7. **Scaffold-first for prompts and connectors** — created in portal, refined in VS Code after sync.
8. **Prompt tools as format enforcers** — specialist produces narrative output → prompt tool reformats into structured data (e.g., JSON). Adds a deterministic extraction step with temperature control.
9. **Evaluator/QC agent** — validates arithmetic, detects cross-agent conflicts, checks structural completeness before final assembly.
10. **Reporter as format normaliser** — produces the final fixed-structure artifact from validated specialist outputs. Reproduces detail, does not summarise.
11. **Agent boundary enforcement** — each specialist has both positive scope AND explicit prohibitions to prevent domain leakage.
12. **Version stamping** — every agent stamped with version in instructions and required in output for regression detection.
13. **Show don't tell for output format** — literal templates + worked examples + negative examples in knowledge files rather than prose format descriptions in instructions.

### Data Flow

```
1. User uploads document (or provides SharePoint URL)
2. Review Request topic triggers (handles both URL and upload input paths)
3. Orchestrator calls File Preprocessor prompt tool → returns HTML/Markdown
   - If conversion fails, stop and ask user for replacement
   - Tell specialists: "This content was converted from the uploaded document"
4. Orchestrator retrieves review standards from its knowledge sources
5. Orchestrator passes preprocessed content + standards to each specialist (sequentially)
6. Each specialist returns a labeled scored result (e.g., RELEVANCE_RESULT)
7. For compliance output, orchestrator calls Citation Analysis prompt tool → returns structured JSON with enriched citations
8. Orchestrator passes all labeled blocks to Evaluator Agent
   - Evaluator checks: arithmetic, cross-agent conflicts, structural completeness
   - Returns validation notes (never empty — even "No conflicts found" is required)
9. Orchestrator passes validated outputs + Evaluator notes to Reporter Agent
   - Reporter reproduces specialist detail verbatim, applies fixed report structure
   - Reporter deduplicates overlapping findings, normalises terminology
10. Report delivered to user (no follow-up prompts appended)
```

### What Must Be Created in the Portal

- Prompt tools (Citation Analysis, File Preprocessor) — portal-first, then sync and refine
- Power Automate flow for report delivery — created in Power Automate, attached in CPS
- Connection references for any external connectors

### What Can Be Authored in YAML

- Agent instructions (orchestrator + all specialists)
- Topic definitions and trigger descriptions
- Child agent definitions and descriptions
- Knowledge source configurations
