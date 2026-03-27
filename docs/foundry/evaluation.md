# Evaluation

## Overview

Foundry provides a comprehensive evaluation framework for AI agents using the Azure AI Projects SDK v2. Unlike CPS (which has no built-in evaluation beyond manual testing), Foundry supports automated batch evaluation with built-in and custom evaluators.

## Prerequisites

```bash
pip install "azure-ai-projects>=2.0.0b2"
```

## Workflow

1. **Initialise client** — `AIProjectClient` → `get_openai_client()`
2. **Upload dataset** — JSONL file via `project_client.datasets.upload_file`
3. **Define evaluators** — built-in, custom code-based, or custom prompt-based
4. **Create evaluation** — `openai_client.evals.create`
5. **Run evaluation** — `openai_client.evals.runs.create`
6. **Check results** — `openai_client.evals.runs.retrieve`

## Built-In Evaluators

### Agent Evaluators

| Evaluator                         | Required Data                     | Description                                            |
| --------------------------------- | --------------------------------- | ------------------------------------------------------ |
| `builtin.intent_resolution`       | query, response                   | Was the user intent correctly identified and resolved? |
| `builtin.task_adherence`          | query, response                   | How well does the response follow the assigned task?   |
| `builtin.task_completion`         | query, response                   | Was the requested task completed end to end?           |
| `builtin.tool_call_accuracy`      | query, tool_definitions           | Are tool calls relevant with correct parameters?       |
| `builtin.tool_selection`          | query, response, tool_definitions | Were the right tools selected for the task?            |
| `builtin.tool_output_utilization` | query, response                   | Were tool outputs used correctly without fabrication?  |
| `builtin.tool_call_success`       | response                          | Did all tool calls succeed without errors/timeouts?    |

### General Purpose

| Evaluator              | Required Data     | Description                                              |
| ---------------------- | ----------------- | -------------------------------------------------------- |
| `builtin.coherence`    | query, response   | Natural flow and human-like quality                      |
| `builtin.fluency`      | response          | Grammar, syntax, vocabulary                              |
| `builtin.relevance`    | query, response   | Captures key points with contextually appropriate output |
| `builtin.groundedness` | response, context | Claims substantiated by source context                   |

### RAG Evaluators

| Evaluator                       | Required Data                 | Description                               |
| ------------------------------- | ----------------------------- | ----------------------------------------- |
| `builtin.retrieval`             | query, context                | Quality of information retrieval          |
| `builtin.response_completeness` | response, ground_truth        | Coverage of key information               |
| `builtin.similarity`            | query, response, ground_truth | Sentence-level embedding similarity (1–5) |

## Custom Evaluators

### Decision Tree

1. **Check built-in first** — always start here
2. **Code-based** — for objective, measurable criteria with specific business logic
3. **Prompt-based** — for subjective criteria requiring LLM judgment

## Relevance to Migration

When migrating a CPS agent to Foundry, evaluation is how you verify functional parity:

- Use `intent_resolution` and `task_adherence` to confirm the Foundry agent handles the same intents as the CPS original
- Use `tool_call_accuracy` to verify tool routing matches CPS topic routing
- Create test datasets from CPS conversation transcripts to establish baseline behavior
