# Topic: Review Request

**Type:** Topic
**CPS Kind:** `AdaptiveDialog`
**Authoring:** YAML — safe to author directly.

## Purpose

The entry point for the review workflow. Triggered when a user wants to submit a document for review.

## Trigger Description

> User wants to submit a document for review, get feedback on content, have a document assessed, or upload something for quality review. Does not handle checking the status of an existing review or escalating to a human reviewer.

## Why the Description Matters

In generative orchestration, this description is how the orchestrator decides to invoke this topic. The explicit "does not handle" clause prevents misrouting of status checks or escalation requests here.

## Behavior

1. Ask the user for the document (file upload)
2. Ask for the document type / review context (optional — helps select the right standards)
3. Confirm: "I'll review this against [framework]. This will take a moment."
4. Hand off to the orchestrator's review pipeline (the orchestrator's instructions take over from here)

## CPS Notes

- This topic handles the conversational intake — collecting the document and context.
- The actual review pipeline is driven by the orchestrator's instructions, not by topic nodes. The topic's job is to collect inputs and let generative orchestration take over.
- File upload handling: the uploaded file is available to the orchestrator, which passes it to the File Preprocessor prompt tool.
