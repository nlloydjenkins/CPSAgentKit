# CR003 - Business-Priority Synthesis & Remediation Strengthening

**Source**: Hastings Messenger post-assessment feedback
**Date**: 2026-03-26
**Status**: Implemented
**Affects**: src/services/solutionReviewer.ts (composeReviewPrompt output format)

---

## Background

CR001 added a conditional Remediation Plan that activates when supporting docs contain crisis signals. This was a significant improvement. However, in the Hastings engagement the analyst still had to manually:

1. Classify each finding into a business-impact time horizon (what is breaking now vs. what can wait)
2. Sequence the remediation plan by real-world dependency rather than just priority ranking
3. Distinguish low-effort configuration changes from medium-effort redesign from strategic rearchitecture

The current Remediation Plan uses priority ordering and qualitative Effort/Risk tags but does not explicitly connect findings to business time horizons or dependency chains. The result is that a customer receives a prioritised list but still needs an analyst to turn it into an action plan they can actually execute.

---

## Change 1 — Add business-impact horizon to findings

**Gap**: Each finding has a Priority (Critical/High/Medium/Low) but no horizon classification. A "High" finding could be "your production system is failing today" or "this will hurt you when you scale in 6 months". Customers care about the difference.

**Proposed change**: Add an **Impact Horizon** field to each finding:

```
- **Impact Horizon**: Immediate operational / Near-term stabilisation / Medium-term improvement / Strategic redesign
```

Definitions:

```
- **Immediate operational**: Actively causing or contributing to a production issue now.
  Must be addressed within the current escalation or exemption window.
- **Near-term stabilisation**: Not breaking production today but creates significant risk
  of recurrence or degradation. Address within weeks.
- **Medium-term improvement**: Reduces technical debt, improves maintainability, or
  prevents future issues. Address within a normal development cycle.
- **Strategic redesign**: Requires architectural rethinking. Important for long-term
  health but should not block immediate stabilisation work.
```

Add an instruction:

```
Impact Horizon is independent of Priority. A Critical finding is usually Immediate
operational, but a High finding could be Near-term stabilisation or Medium-term
improvement depending on whether it is actively affecting production.
```

**Why this matters**: This directly answers the customer's question "what do I do first and why?" without requiring an analyst to manually triage.

**Effort**: Low — prompt text addition to finding template.

---

## Change 2 — Strengthen remediation plan with dependency sequencing

**Gap**: The current Remediation Plan lists phases by priority with Effort/Risk/Dependencies fields, but does not instruct the reviewer to explicitly reason about real dependency chains. In the Hastings engagement, the analyst manually determined that token caching had to come before save batching, which had to come before flow reduction, because each change depended on the prior one being stable.

**Proposed change**: Add explicit dependency-sequencing instructions to the Remediation Plan section:

```
Sequence actions by real-world dependency, not just priority. If Action B depends
on Action A being in place, Action A must come first regardless of its individual
priority ranking.

For each phase:
- Action: specific change to make
- Addresses: which finding(s) this resolves (reference finding numbers)
- Impact: estimated improvement to the constraint being addressed
- Effort: Low (configuration change) / Medium (code or flow rework) / High (architectural redesign)
- Risk: Low / Medium / High
- Dependencies: what must be completed first (reference prior phase numbers)
- Effort type: Configuration change / Flow rework / Architectural redesign

After listing all phases, include a brief dependency narrative explaining the
sequencing rationale in 2-3 sentences.
```

**Why this matters**: Without dependency reasoning, customers may attempt high-priority changes in parallel and discover they conflict or that one prerequisite was missed. The current prompt already has a Dependencies field but does not instruct the reviewer to use it for sequencing logic.

**Effort**: Low — prompt text modification to existing Remediation Plan section.

---

## Change 3 — Effort-type distinction in remediation

**Gap**: The current Effort field uses Low/Medium/High but does not distinguish *type* of effort. In the Hastings engagement, "Low" covered both "change an environment variable" and "restructure a topic's conversation flow" — they are both low calendar-time items but very different in skill requirement and risk profile.

**Proposed change**: Already included in Change 2 above — the "Effort type" field (Configuration change / Flow rework / Architectural redesign) addresses this. No separate change needed, but calling it out because the feedback specifically flagged it.

---

## Summary

| # | Area | Gap | Change | Effort |
|---|------|-----|--------|--------|
| 1 | Finding structure | No business-impact time horizon | Add "Impact Horizon" field with 4-level classification | Low |
| 2 | Remediation plan | Priority ordering without dependency logic | Add dependency-sequencing instructions and effort-type field | Low |

## Implementation Notes

Changes are prompt text modifications in `composeReviewPrompt` within [src/services/solutionReviewer.ts](../src/services/solutionReviewer.ts):

1. Add Impact Horizon field to the finding template (after Evidence field, around line 457)
2. Add Impact Horizon definitions to the evidence/definitions block (around line 466-470)
3. Update the Remediation Plan section instructions (around line 428-445) to include dependency-sequencing reasoning, effort type, and the dependency narrative instruction
