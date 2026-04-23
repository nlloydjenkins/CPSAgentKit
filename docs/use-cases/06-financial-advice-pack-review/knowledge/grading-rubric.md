# Grading Rubric — Suitability Pack Scoring

**Version:** 1.0
**Scope:** Grading Rubric prompt tool only.
**Audience:** agent internal.

This document is the only source for the numerical scoring applied to an advice pack. The Grading Rubric prompt tool MUST use these weights, thresholds, and worked examples — never model defaults. Score components come from the earlier stage outputs; this stage converts RAG verdicts into weighted scores.

---

## Pillars and Weights

Five pillars, total 100 points:

| Pillar ID | Pillar                       | Weight |
| --------- | ---------------------------- | ------ |
| GR-1      | Client Understanding         | 25     |
| GR-2      | Recommendation Justification | 25     |
| GR-3      | Risk Alignment               | 20     |
| GR-4      | Cost Transparency            | 15     |
| GR-5      | Documentation Completeness   | 15     |
| **Total** |                              | 100    |

Weights are fixed in this document. If the firm changes a weight, update this file and the `Version` header — do not change the weight in any prompt.

---

## Input to the Grading Rubric stage

The Grading Rubric consumes:

- `CD_RAW` (Consumer Duty Evaluator output)
- `SP_RAW` (Suitability Policy Evaluator output)
- `Topic.PackClassification` (from Pack Classifier)

It does NOT re-evaluate the pack. It converts the prior verdicts into pillar scores.

---

## Pillar-to-Criterion Mapping

Each pillar's score is calculated from a fixed set of criteria in the prior stages. Criteria marked `N/A` (e.g. SP-8 for non-transfer advice) are removed from the denominator so the pillar is scored on applicable criteria only.

### GR-1 — Client Understanding (25)

Contributing criteria:

- `CD-CU-1`, `CD-CU-2`, `CD-CU-3`, `CD-CU-4`
- `SP-1`, `SP-10`, `SP-12`

### GR-2 — Recommendation Justification (25)

Contributing criteria:

- `CD-X-1`, `CD-X-3`
- `CD-PS-1`, `CD-PS-2`, `CD-PS-3`
- `CD-PV-2`, `CD-PV-4`
- `SP-4`, `SP-6`, `SP-11`

### GR-3 — Risk Alignment (20)

Contributing criteria:

- `CD-X-2`
- `CD-PS-4`
- `SP-2`, `SP-3`, `SP-6`, `SP-8`

### GR-4 — Cost Transparency (15)

Contributing criteria:

- `CD-PV-1`, `CD-PV-3`, `CD-PV-5`
- `SP-5`, `SP-7`, `SP-9`

### GR-5 — Documentation Completeness (15)

Contributing criteria:

- `CD-CS-1`, `CD-CS-2`, `CD-CS-3`, `CD-CS-4`
- `SP-11`, `SP-12`
- Presence of all five pack components (Fact Find, Suitability Report, ATR, Costs & Charges, Illustration) — each missing component deducts 3 points.

Note: `SP-11` and `SP-12` appear in both GR-2 and GR-5 (justification vs completeness). This is deliberate — an unsigned declaration harms both.

---

## Verdict-to-Points Conversion

For each criterion:

- **Green** → full share of the pillar weight
- **Amber** → half share
- **Red** → zero
- **N/A** → excluded from denominator

**Formula per pillar:**

```
pillar_score = pillar_weight × (sum_of_applicable_verdict_values / count_of_applicable_criteria)

where verdict_value = 1.0 (Green), 0.5 (Amber), 0.0 (Red)
```

### Worked example — GR-4 (weight 15)

Applicable criteria: `CD-PV-1 Green`, `CD-PV-3 Amber`, `CD-PV-5 Green`, `SP-5 Amber`, `SP-7 Red`, `SP-9 Green`.

Verdict sum = 1.0 + 0.5 + 1.0 + 0.5 + 0.0 + 1.0 = 4.0
Count = 6
Pillar score = 15 × (4.0 / 6) = **10.0 / 15**

### Worked example — GR-3 with transfer N/A removed

For non-transfer advice where `SP-8 = N/A`:

Applicable criteria: `CD-X-2 Green`, `CD-PS-4 N/A`, `SP-2 Green`, `SP-3 Amber`, `SP-6 Green`. After removing N/A: count = 4.

Verdict sum = 1.0 + 1.0 + 0.5 + 1.0 = 3.5
Count = 4
Pillar score = 20 × (3.5 / 4) = **17.5 / 20**

---

## Overall Verdict Thresholds

The Grading Rubric also assigns an overall verdict based on total score and red-count rules:

| Total Score | Red count                                  | Overall Verdict        |
| ----------- | ------------------------------------------ | ---------------------- |
| ≥ 85        | 0                                          | `APPROVE`              |
| 70–84       | 0–2                                        | `APPROVE_WITH_CHANGES` |
| 50–69       | any                                        | `APPROVE_WITH_CHANGES` |
| < 50        | any                                        | `ESCALATE`             |
| any         | ≥ 3                                        | `ESCALATE`             |
| any         | Any Red on a cross-cutting rule (`CD-X-*`) | `ESCALATE`             |
| any         | Any Red on `SP-8` (pension transfer)       | `ESCALATE`             |

The rubric applies these rules in order. The last matching rule wins — so a pack with 88 points but a Red on `CD-X-2` escalates regardless of total.

---

## Output contract

The Grading Rubric must produce output labeled `GR_RAW`:

```
GR_RAW

Pillar scores:
GR-1 Client Understanding: [x.x] / 25 — [contributing criteria with verdicts]
GR-2 Recommendation Justification: [x.x] / 25 — [contributing criteria]
GR-3 Risk Alignment: [x.x] / 20 — [contributing criteria]
GR-4 Cost Transparency: [x.x] / 15 — [contributing criteria]
GR-5 Documentation Completeness: [x.x] / 15 — [contributing criteria]

Total: [xx.x] / 100

Red count: [n]
Cross-cutting reds: [list or "none"]
Transfer analysis reds (SP-8): [list or "none"]

Rule applied: [name of the threshold row that decided the verdict]
Overall verdict: [APPROVE|APPROVE_WITH_CHANGES|ESCALATE]
```

Scores must be calculated — not estimated — using the formula above. Show the working. If an input criterion is missing from `CD_RAW` or `SP_RAW`, do not infer — flag `INPUT_INCOMPLETE` and stop. The Validator will handle the re-run.
