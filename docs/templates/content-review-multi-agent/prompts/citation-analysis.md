# Prompt: Citation Analysis

**Type:** Prompt tool (with code interpreter)
**Authoring:** Portal-first — create in Copilot Studio, then sync and refine.

## Purpose

Extracts structured citation data from preprocessed document content. Identifies all citations, their format, what they reference, and where they appear. The output feeds into the Citation Specialist agent for qualitative validation.

## Why a Prompt Tool (Not an Agent)

Citation extraction is a structured data task — find patterns, parse references, output a list. This is exactly what prompt tools with code interpreter excel at. Qualitative judgment ("is this citation supporting the claim?") is what the Citation Specialist agent handles.

## Configuration

| Setting          | Value       |
| ---------------- | ----------- |
| Code interpreter | **Enabled** |
| Model            | Default     |
| Temperature      | 0           |
| Knowledge        | None        |

## Prompt Text

```
Analyze the following content and extract all citations and references.

For each citation found, return:
- ref_id: the citation identifier as it appears in the text
- location: the sentence or paragraph where it appears
- claim: the factual claim the citation supports
- source: the referenced source (if identifiable)
- format: the citation format used (e.g., footnote, inline, bibliography)

Return the results as a structured list.

If no citations are found, return: "NO_CITATIONS_FOUND"

Content to analyze:
{{preprocessed_content}}
```

## Input/Output

- **Input:** `preprocessed_content` — the document text from the File Preprocessor
- **Output:** `CITATION_ANALYSIS` — structured citation data

## CPS Notes

- The `{{preprocessed_content}}` placeholder maps to an input parameter on the prompt. Define this parameter when creating the prompt in the portal.
- Input parameter names must be human-readable — the orchestrator generates collection questions from them if it needs to ask the user. Name it `preprocessed_content` with description "The document text to analyze for citations."
