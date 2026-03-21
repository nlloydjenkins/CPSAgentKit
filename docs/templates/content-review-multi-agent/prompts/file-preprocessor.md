# Prompt: File Preprocessor

**Type:** Prompt tool (with code interpreter)
**Authoring:** Portal-first — create in Copilot Studio, then sync and refine.

## Purpose

Converts uploaded documents (PDF, DOCX, PPTX) into structured text (HTML or Markdown) before passing to review specialists. This is the preprocessing step that makes the rest of the pipeline reliable.

## Why a Prompt Tool

- CPS supports code interpreter on prompt tools — this is the documented path for file processing.
- Passing raw binary files through orchestration to child agents is unreliable.
- A deterministic conversion step ensures every specialist works from the same normalized text.

## Configuration

| Setting          | Value                                                |
| ---------------- | ---------------------------------------------------- |
| Code interpreter | **Enabled**                                          |
| Model            | Default (or GPT-4o/GPT-5 depending on quality needs) |
| Temperature      | 0 (deterministic conversion, no creativity needed)   |
| Knowledge        | None                                                 |

## Prompt Text

```
Convert the uploaded document to well-structured HTML. Preserve:
- All headings and their hierarchy
- Paragraph structure
- Tables (as HTML tables)
- Lists (ordered and unordered)
- Bold/italic formatting

Do not add commentary, analysis, or interpretation. Return only the converted HTML.

If the document cannot be processed, return: "PREPROCESSING_FAILED: [reason]"
```

## Input/Output

- **Input:** Uploaded file (via code interpreter file handling)
- **Output:** `PREPROCESSED_CONTENT` — the HTML/Markdown text

## CPS Notes

- Create this prompt in Copilot Studio first. Enable code interpreter in the prompt settings.
- After creation, use `Get Changes` to pull locally. Refine the prompt text in VS Code.
- The prompt tool appears as a tool the orchestrator can call by name.
- Temperature 0 is set in the prompt editor — this is the only place CPS exposes temperature control.
