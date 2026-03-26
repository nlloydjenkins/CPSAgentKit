# CR004 - Inference Confidence Guardrails

**Source**: Hastings Messenger post-assessment feedback
**Date**: 2026-03-26
**Status**: Implemented
**Affects**: src/services/solutionReviewer.ts (composeReviewPrompt output format)

---

## Background

The feedback identified a recurring quality issue: the kit sometimes presents inferred or probable implementation details as confirmed facts. In the Hastings engagement, architecture explanation content needed manual correction because controls that were *possible* or *suggested in a diagram* were phrased as if they were *verified in the solution artifacts*.

This is a prompt discipline problem. The evidence model (CR001) classifies the *type* of evidence but does not instruct the reviewer to explicitly distinguish between what was directly confirmed in the artifacts vs. what was inferred from structure or patterns.

---

## Change 1 — Add confidence-level guardrails to the output format

**Gap**: The reviewer can state "the solution uses X" when the artifacts only show circumstantial evidence of X. The current Evidence field tags the type (Documented/Observed/Solution-specific) but does not enforce explicit language about confidence.

**Proposed change**: Add an inference discipline instruction to the output format preamble:

```
### Inference Discipline

When describing what the solution does, use language that matches your actual
confidence level:

- **Confirmed**: You can point to a specific YAML file, XML element, environment
  variable, or topic configuration that directly shows this. Use definitive language:
  "The solution uses...", "Topic X implements...", "The environment variable is set to..."

- **Inferred from structure**: The artifact structure suggests this but you cannot
  point to a single definitive element. Use qualified language: "The topic structure
  suggests...", "Based on the flow pattern, this likely...", "The presence of X
  indicates that Y is probably..."

- **Expected from context**: Customer documents or architecture diagrams describe
  this but the solution artifacts do not confirm it. Use attribution language:
  "The architecture document states...", "According to the customer's diagram...",
  "The escalation notice references..."

- **Not verifiable**: You cannot confirm this from any available source. Do not
  state it as fact. Either omit it or explicitly flag it: "This could not be
  verified in the available artifacts."

Do NOT describe controls, integrations, or patterns as implemented unless you
can cite the specific artifact. When a customer-supplied diagram shows a component
(e.g., APIM, WAF, managed identity) but the solution YAML does not reference it,
say "shown in the architecture diagram" not "the solution uses".
```

**Why this matters**: Assessment credibility depends on the reader trusting that "the solution does X" means the reviewer actually saw X in the artifacts. Overclaiming erodes trust and forces the analyst to manually downgrade language throughout the report.

**Effort**: Low — prompt text addition only.

---

## Change 2 — Add a verification note to the Architecture Assessment section

**Gap**: The Architecture Assessment section reviews multi-agent decomposition and routing patterns but does not instruct the reviewer to flag when architecture claims come from external diagrams vs. solution artifacts.

**Proposed change**: Add this instruction to the Architecture Assessment section:

```
When referencing architecture components that appear in customer-supplied diagrams
or documents but are not visible in the CPS solution artifacts (e.g., API Management,
identity providers, network topology, external services), clearly attribute the source:
"Per the customer's architecture diagram, the solution sits behind APIM" rather than
"The solution uses APIM for routing."
```

**Effort**: Low — one paragraph added to existing section instructions.

---

## Summary

| # | Area | Gap | Change | Effort |
|---|------|-----|--------|--------|
| 1 | Output format | Inferred details stated as confirmed facts | Add inference discipline instruction with 4-level confidence language | Low |
| 2 | Architecture section | External diagram components stated as solution features | Add source-attribution instruction for architecture claims | Low |

## Implementation Notes

Changes are prompt text modifications in `composeReviewPrompt` within [src/services/solutionReviewer.ts](../src/services/solutionReviewer.ts):

1. Add the Inference Discipline section to the output format preamble, before the Evidence Note (around line 418-420)
2. Add the architecture attribution instruction to the Architecture Assessment section instructions (around line 460)
