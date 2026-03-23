# Changes for v0.2.1

Changes to improve the assessment report credibility and evidence transparency, based on real-world feedback from a produced assessment.

---

## 1. Add evidence classification to each finding

**What:** Add an `**Evidence**` field to the finding template in the review prompt. Each finding must be classified as one of three types.

**Why:** The single most valuable change. Makes the report defensible in stakeholder review without weakening real-world findings. Readers can immediately see whether a finding is backed by Microsoft docs, field experience, or direct observation of the reviewed YAML.

**Where:** `src/services/solutionReviewer.ts` — finding template in `composeReviewPrompt()`

**Change the finding structure from:**

```
- **Priority**: Critical / High / Medium / Low
- **Category**: (e.g., Prompt Engineering, Descriptions, Architecture, Constraints, Tool Safety)
- **Finding**: What the issue is
- **Rule**: Which specific best practice rule it violates
- **Where**: Which agent/file/line is affected
- **Suggested fix**: Concrete, specific change
```

**To:**

```
- **Priority**: Critical / High / Medium / Low
- **Evidence**: Documented platform behaviour / Observed platform behaviour / Solution-specific observation
- **Category**: (e.g., Prompt Engineering, Descriptions, Architecture, Constraints, Tool Safety)
- **Finding**: What the issue is
- **Rule**: Which specific best practice rule it violates
- **Where**: Which agent/file/line is affected
- **Suggested fix**: Concrete, specific change
```

**Evidence definitions to add to the prompt:**

- `Documented platform behaviour` — maps to published Microsoft Learn documentation or explicit platform limitations
- `Observed platform behaviour` — field-tested behaviour from real CPS deployments (edge cases, planner quirks, silent failures) that official docs understate or omit
- `Solution-specific observation` — observation about this specific solution's YAML configuration, not a general platform claim

---

## 2. Add report preface to output format

**What:** Add a framing paragraph at the top of the Executive Summary instructing Copilot to include an evidence disclaimer.

**Why:** Solves the credibility problem in one paragraph. Stakeholders understand what they're reading without needing a separate companion document.

**Where:** `src/services/solutionReviewer.ts` — output format section

**Add before the Executive Summary:**

```
### Evidence Note
> This assessment combines three kinds of evidence: published Copilot Studio platform guidance, repeated real-world platform behaviour observed in practice, and direct observations from this solution's YAML. Not every finding is equally documented by Microsoft, but each is included because it is relevant to production behaviour or maintainability. The **Evidence** field on each finding indicates which type applies.
```

---

## 3. Soften priority definitions for non-deterministic failures

**What:** Adjust the Critical and High priority wording to distinguish deterministic failures from production risks.

**Why:** Current wording ("Will cause broken behaviour") is too absolute for non-deterministic platform behaviours. Some things create significant risk without being guaranteed failures. This makes the report more defensible without reducing urgency.

**Where:** `src/services/solutionReviewer.ts` — priority definitions

**Change from:**

```
- Critical: Will cause broken behaviour, wrong routing, or tool failures
- High: Significantly degrades quality, causes unreliable behaviour
```

**To:**

```
- Critical: Deterministic failure or near-certain broken behaviour — wrong routing, tool failures, or blocked functionality
- High: Creates significant production risk — unreliable behaviour, degraded quality, or silent failures likely under real-world conditions
```

---

## 4. Separate governance recommendations from platform violations

**What:** Add a note in the review instructions telling Copilot to frame process/governance recommendations differently from platform constraint violations.

**Why:** Recommendations like "add version stamps" or "implement structured test cycles" are governance improvements, not platform violations. Presenting them the same way as "this description will cause misrouting" weakens both.

**Where:** `src/services/solutionReviewer.ts` — after the finding structure, before the Architecture Assessment section

**Add:**

```
When a finding is a governance or process improvement (version stamping, test cycles, changelog practices) rather than a platform constraint violation, frame it as a governance recommendation. Use language like "recommended practice" or "governance improvement" rather than "violates" or "breaks".
```

---

## 5. NOT doing: Remove or weaken real-world findings

The feedback explicitly states — and I agree — that the right correction is **not** to make the assessment more Microsoft-only. Real-world findings (coin-flip routing from overlapping descriptions, topic-stack issues, channel inconsistencies, instruction drift) are often the most valuable part of the assessment. They stay.

## 6. NOT doing: Enumerate source material

The feedback recommends not naming or enumerating non-Microsoft source material in the report. The current approach (citing "best practice rules" generically) already handles this correctly. No change needed.

---

## Implementation Summary

| #   | Change                        | File                               | Effort |
| --- | ----------------------------- | ---------------------------------- | ------ |
| 1   | Evidence classification field | `src/services/solutionReviewer.ts` | Small  |
| 2   | Report preface paragraph      | `src/services/solutionReviewer.ts` | Small  |
| 3   | Soften priority definitions   | `src/services/solutionReviewer.ts` | Small  |
| 4   | Governance framing note       | `src/services/solutionReviewer.ts` | Small  |

All four changes are in one file. Total: ~20 lines changed in the prompt template.
