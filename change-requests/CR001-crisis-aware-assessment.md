# CR001 - Crisis-Aware Assessment Prompt

**Source**: Hastings Messenger test assessment (manual post-assessment edits)
**Date**: 2026-03-25
**Status**: Implemented
**Affects**: src/services/solutionReviewer.ts (composeReviewPrompt output format)

---

## Background

After running the assessment prompt against the Hastings Messenger solution, three manual changes were needed before the report was customer-ready. Two of these represent gaps in the prompt instructions that should be addressed in the product. The third (spec/architecture generation) already worked as designed.

The customer context: a 30-day exemption from Microsoft following a platform execution limit breach and CIO escalation. The assessment identified the root causes but did not produce a remediation plan or surface the crisis in the report structure.

---

## Change 1 - Conditional Crisis Remediation Plan

**Gap**: The assessment produces findings and quick wins but does not generate a time-bound remediation plan tied to the customer's immediate crisis. When a customer has an active platform constraint, deadline, or escalation, the report needs to tell them what to do, in what order, within their deadline.

**What was added manually**: A "30-Day Exemption Remediation Plan" section with 5 phased actions, each with impact estimate, effort, risk level, and a summary table.

**Proposed change**: Add a conditional section to the Required Output Format in `composeReviewPrompt` that instructs the reviewer to:

1. Scan the Requirements Docs and Spec for evidence of active platform constraints, deadlines, or escalations (e.g., execution limit breaches, exemption windows, CIO escalations, compliance deadlines)
2. If found, generate a prioritised remediation plan with time-boxed phases that maps critical findings to specific actions within the deadline
3. Each phase should include: action description, which finding(s) it addresses, estimated impact, effort level, risk level, and dependencies
4. Include a summary table at the end of the plan

**Where in the output format**: Insert as a conditional section between the Executive Summary (Section 1) and What the Solution Does Well.

**Section template**:

```
### 2. Remediation Plan (conditional)

If the Requirements Docs, Spec, or solution context indicate an active platform constraint,
deadline, or escalation (e.g., execution limit breach, exemption window, compliance deadline,
CIO escalation), generate a prioritised remediation plan:

- Identify the constraint and its deadline from the supporting documents
- Map critical and high-priority findings to concrete remediation actions
- Organise actions into time-boxed phases that fit within the deadline
- For each phase include:
  - Phase number and timeframe (e.g., Days 1-3)
  - Action: specific change to make
  - Addresses: which finding(s) this resolves
  - Impact: estimated reduction or improvement
  - Effort: Low / Medium / High
  - Risk: Low / Medium / High
  - Dependencies: what must be in place first
- End with a summary table of all phases

If no active constraint or deadline is found, omit this section entirely.
```

**Effort**: Low - prompt text change only, no code logic changes.

---

## Change 2 - Crisis-Aware Report Structure

**Gap**: The current section order is fixed: (1) Executive Summary, (2) What It Does Well, (3) Findings, (4) Architecture Assessment, (5) Quick Wins. The most urgent customer issue was buried in finding descriptions rather than being the first thing the reader sees. The Executive Summary used a neutral review tone rather than leading with the crisis.

**What was changed manually**:
- Executive Summary rewritten to open with the platform limit breach and 30-day exemption, with a direct pointer to the remediation plan
- Remediation Plan moved to Section 2 (immediately after the Executive Summary)
- Final order: (1) Executive Summary, (2) Remediation Plan, (3) What It Does Well, (4) Findings, (5) Architecture Assessment, (6) Quick Wins

**Proposed change**: Update the output format instructions in `composeReviewPrompt` to:

1. Instruct the Executive Summary to lead with the customer's most pressing constraint or crisis when one exists in the supporting docs, before giving the general quality overview
2. Place the conditional Remediation Plan at Section 2 (renumber subsequent sections)
3. Add explicit instruction to extract deadlines, escalation status, and platform constraints from supporting docs and use them to shape report structure and tone

**Updated section order**:

```
1. Executive Summary
   - Must lead with the most pressing constraint or crisis if one exists
   - Include a direct pointer to the Remediation Plan when present
   - Then 2-3 sentences on overall solution quality and the most important finding
2. Remediation Plan (conditional - see Change 1)
3. What the Solution Does Well
4. Findings (Prioritised)
5. Architecture Assessment
6. Quick Wins
7. Generate Spec and Architecture (if missing)
```

**Supporting docs analysis instruction** (add before the output format):

```
Before writing the report, scan all Requirements Docs for:
- Active platform constraints (execution limits, throttling, exemptions)
- Deadlines (exemption windows, compliance dates, migration timelines)
- Escalation status (CIO involvement, Microsoft case numbers, support tickets)
- Business urgency signals (production outages, user impact, SLA breaches)

Use these to determine whether the report needs a Remediation Plan section
and whether the Executive Summary should lead with urgency context.
```

**Effort**: Low - prompt text reordering and additions, no code logic changes.

---

## Change 3 - Spec and Architecture Generation

**Gap**: None.

**What happened**: The assessment prompt instructions asked for three deliverables. The spec.md and architecture.md were generated from the solution YAML using the templates in the workspace. This worked as designed.

**Proposed change**: None - already implemented. Confirming this feature works correctly.

---

## Summary

| # | Area | Gap | Change | Effort |
|---|------|-----|--------|--------|
| 1 | Remediation planning | No time-bound action plan tied to customer deadlines | Add conditional "Crisis Remediation Plan" section when supporting docs contain active escalation/deadline | Low |
| 2 | Report structure | Crisis buried in findings, not surfaced in summary | Executive Summary must lead with most urgent constraint; remediation plan at Section 2; extract deadlines from supporting docs | Low |
| 3 | Spec/arch generation | None | No change needed - working as designed | N/A |

---

## Implementation Notes

All changes are prompt text modifications in `composeReviewPrompt` within [src/services/solutionReviewer.ts](../src/services/solutionReviewer.ts). No new code logic, UI changes, or additional file reads are required. The crisis detection is handled entirely by the LLM based on the supporting docs content already included in the prompt.

Key implementation points:
- The Remediation Plan section is conditional - it only appears when the LLM detects crisis/deadline signals in the supporting docs. This keeps the report structure clean for routine assessments.
- Section numbering in the output format needs to shift to accommodate the new conditional section.
- The "scan supporting docs" instruction should go before the output format section so the LLM has the analysis context before it encounters the section structure.
