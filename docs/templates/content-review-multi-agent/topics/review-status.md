# Topic: Review Status

**Type:** Topic
**CPS Kind:** `AdaptiveDialog`
**Authoring:** YAML — safe to author directly.

## Purpose

Handles requests to check the status of a review that's in progress or recently completed.

## Trigger Description

> User wants to check the status of a document review, see how their submission is progressing, or retrieve a previous review result. Does not handle submitting new documents for review or escalating to a human reviewer.

## Behavior

1. Retrieve the current review state from conversation variables or a connected data source
2. Report status: "in progress", "complete", or "not found"
3. If complete, offer to display the report

## CPS Notes

- CPS conversation history is limited to 10 turns. If the review was discussed earlier in a long conversation, the status may not be in the visible context window. Store review state in variables, not conversation history.
- If reviews are tracked externally (e.g., Dataverse, SharePoint list), this topic would call a connector or flow to look up status. That connector should be scaffold-first (created in portal, synced locally).
