# Topic: Escalation

**Type:** Topic
**CPS Kind:** `AdaptiveDialog`
**Authoring:** YAML — safe to author directly.

## Purpose

Routes the user to a human reviewer when the automated review produces uncertain results, the user disagrees with scores, or the content requires human judgement.

## Trigger Description

> User wants to speak to a human reviewer, disagrees with review results, wants to escalate a review, or the automated review flagged items as NEEDS_REVIEW. Does not handle submitting new documents or checking review status.

## Behavior

1. Acknowledge the escalation request
2. Collect reason for escalation (disagreement, uncertainty, policy requirement)
3. Transfer to human reviewer via the configured channel (Omnichannel, Teams, email)

## CPS Notes

- If transferring to Omnichannel, the 28 KB variable limit applies. If review results are stored in variables, they may be silently dropped during transfer if they exceed this limit. Consider storing the full report externally and passing only a reference ID.
- Human handoff behavior differs by channel. Test in the actual target channel, not the test pane.
