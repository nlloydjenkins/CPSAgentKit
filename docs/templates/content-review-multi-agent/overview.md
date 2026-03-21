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
                           → Report Assembly (orchestrator compiles final output)
```

### Why This Shape

- **Hub-and-spoke, not chain.** CPS blocks multi-level chaining (parent → child → child's child). All specialists connect directly to the orchestrator.
- **Child agents for review pillars.** Each specialist has its own instructions, knowledge, and tool budget — cleanly partitioned. This avoids hitting the 25-30 tool practical limit on a single agent.
- **Prompt tools for extraction.** Citation analysis and file preprocessing use prompt tools with code interpreter — the documented CPS path for deterministic file processing.
- **Knowledge on the orchestrator.** Review standards and scoring frameworks are attached as knowledge sources on the orchestrator. The parent retrieves the relevant standards and passes them to each specialist as context. This avoids relying on non-deterministic retrieval inside each child agent for mission-critical criteria.
- **Labeled output preservation.** Each specialist returns a labeled block (e.g., `RELEVANCE_RESULT`, `CLARITY_RESULT`). The orchestrator is instructed to preserve these verbatim rather than paraphrasing — a mitigation for CPS generative orchestration's default summarisation behavior.

### Component Inventory

| Component             | Type           | CPS Kind               | Authoring     |
| --------------------- | -------------- | ---------------------- | ------------- |
| Review Orchestrator   | Parent agent   | `GptComponentMetadata` | YAML + portal |
| Relevance Specialist  | Child agent    | `AgentDialog`          | YAML          |
| Clarity Specialist    | Child agent    | `AgentDialog`          | YAML          |
| Compliance Specialist | Child agent    | `AgentDialog`          | YAML          |
| Tone Specialist       | Child agent    | `AgentDialog`          | YAML          |
| Citation Specialist   | Child agent    | `AgentDialog`          | YAML          |
| Citation Analysis     | Prompt tool    | —                      | Portal-first  |
| File Preprocessor     | Prompt tool    | —                      | Portal-first  |
| Review Request        | Topic          | `AdaptiveDialog`       | YAML          |
| Review Status         | Topic          | `AdaptiveDialog`       | YAML          |
| Escalation            | Topic          | `AdaptiveDialog`       | YAML          |
| Report Delivery Flow  | Power Automate | —                      | Portal-first  |

### Key CPS Patterns Used

1. **File preprocessing before delegation** — raw binary files don't pass reliably through orchestration. Convert first.
2. **Knowledge dual-placement** — full scoring frameworks in knowledge sources, key rules summarised in orchestrator instructions. Retrieval is not deterministic enough to rely on knowledge alone for mission-critical criteria.
3. **Labeled output blocks** — prevents generative orchestration from summarising specialist results.
4. **Child completion: "Don't respond"** — children return output variables, not user-facing messages. Parent controls all user interaction.
5. **Final artifact suppression** — orchestrator is told the report is final and must not append follow-up prompts.
6. **Instruction decomposition** — review logic split across focused specialists rather than one large instruction block.
7. **Scaffold-first for prompts and connectors** — created in portal, refined in VS Code after sync.

### Data Flow

```
1. User uploads document
2. Review Request topic triggers
3. Orchestrator calls File Preprocessor prompt tool → returns HTML/Markdown
4. Orchestrator retrieves review standards from its knowledge sources
5. Orchestrator passes preprocessed content + standards to each specialist (sequentially)
6. Each specialist returns a labeled scored result
7. Orchestrator assembles all results into final report
8. Report delivered to user (no follow-up prompts appended)
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
