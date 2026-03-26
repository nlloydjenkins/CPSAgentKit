# CR002 - Evidence Confidence & Issue-Source Classification

**Source**: Hastings Messenger post-assessment feedback
**Date**: 2026-03-26
**Status**: Implemented
**Affects**: src/services/solutionReviewer.ts (composeReviewPrompt output format)

---

## Background

CR001 introduced a three-tier evidence model (Documented platform / Observed platform / Solution-specific). In practice, the analyst had to manually add a fourth category — information stated directly by the customer in escalation documents, issue statements, or meeting notes. These are not platform observations or solution-specific findings; they are external business facts that anchor the assessment.

Separately, the analyst had to manually distinguish whether each finding was a platform limitation, a customer implementation decision, or an integration/Azure/Power Automate issue. In the Hastings engagement this distinction was critical: the production crisis was an integration pattern issue (Power Automate execution volume), not a Copilot Studio platform defect. Without that separation the assessment risked misattributing root cause.

---

## Change 1 — Add "Customer-stated context" as 4th evidence tier

**Gap**: Findings backed by customer-supplied documents (escalation emails, exemption notices, CIO-level communications) have no evidence classification. The analyst had to manually separate "the customer told us this" from "we observed this in the YAML".

**Proposed change**: Add a fourth evidence type to the Evidence Note and finding template:

```
- **Customer-stated context**: Information provided in the customer's own documents —
  escalation notices, exemption letters, issue descriptions, meeting notes, or
  architecture explanations. Not independently verified in the solution artifacts.
```

Update the finding Evidence field to include the new type:

```
- **Evidence**: Documented platform behaviour / Observed platform behaviour /
  Solution-specific observation / Customer-stated context
```

**Why this matters**: Assessment credibility depends on the reader knowing which claims are verifiable in the solution vs. taken on trust from the customer. Mixing these silently weakens the report.

**Effort**: Low — prompt text addition only.

---

## Change 2 — Add issue-source classification field

**Gap**: The current finding structure tags priority, evidence type, and category but not the *source* of the issue. A finding like "excessive Power Automate executions" is categorised under Architecture but readers cannot immediately see that it is an integration-layer problem outside CPS, not a CPS platform issue or a CPS prompt design flaw.

**Proposed change**: Add a **Source** field to each finding:

```
- **Source**: Platform limitation / Solution implementation / Integration pattern
```

Definitions:

```
- **Platform limitation**: A constraint or behaviour inherent to Copilot Studio that the
  customer cannot change — only work around or design for
- **Solution implementation**: A decision made in this solution's CPS configuration
  (topics, prompts, knowledge, actions) that could be changed by the customer
- **Integration pattern**: An issue in the surrounding Azure, Power Automate, Dataverse,
  identity, or connector layer — outside CPS itself but affecting the solution
```

Add an instruction to the output format:

```
When a finding's root cause spans multiple sources (e.g., a CPS topic triggers
excessive Power Automate calls), tag the primary source and note the secondary
in the finding description.
```

**Why this matters**: Customers need to know *who owns the fix*. Platform limitations go to Microsoft. Solution implementation goes to the customer's CPS team. Integration patterns go to the Azure/Power Platform team. Misattribution wastes time and credibility.

**Effort**: Low — prompt text addition only. No code logic changes.

---

## Summary

| # | Area | Gap | Change | Effort |
|---|------|-----|--------|--------|
| 1 | Evidence model | No classification for customer-supplied business context | Add "Customer-stated context" as 4th evidence tier | Low |
| 2 | Finding structure | No distinction between platform / solution / integration issues | Add "Source" field to findings with 3-way classification | Low |

## Implementation Notes

Both changes are prompt text modifications in `composeReviewPrompt` within [src/services/solutionReviewer.ts](../src/services/solutionReviewer.ts):

1. Add the 4th evidence type to the Evidence Note section (around line 466-468)
2. Add the 4th type to the finding template Evidence field (around line 457)
3. Add the Source field and definitions after the Evidence field in the finding template
4. Add the multi-source attribution instruction after the Source definitions
