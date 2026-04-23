# Consumer Duty Rules — Assessment Knowledge Source

**Version:** 1.0
**Scope:** Consumer Duty Evaluator prompt tool only.
**Audience:** agent internal — not for client-facing output.

This document is the sole source the Consumer Duty Evaluator uses to assess a financial advice document pack. The Evaluator must cite the specific rule ID (e.g. `CD-PV-3`) in every verdict. No Consumer Duty judgement may rely on general model knowledge.

The content below is modelled on the FCA Consumer Duty framework (PRIN 2A and the supporting FG22/5 guidance) as a **reference pattern**. Before production use, a qualified compliance officer must review, correct, and approve all wording.

---

## The Cross-Cutting Rules

Every outcome is assessed against all three cross-cutting rules. A Red verdict on any cross-cutting rule raises the overall outcome verdict to at least Amber.

- **CD-X-1 — Act in good faith.** Evidence in the pack must show the adviser considered the client's interests, not just product suitability. Red if the recommendation is driven by product availability rather than client need.
- **CD-X-2 — Avoid causing foreseeable harm.** Evidence that reasonably foreseeable risks (drawdown longevity, loss capacity, transfer value erosion) have been identified and disclosed. Red if a material foreseeable harm is unaddressed.
- **CD-X-3 — Enable clients to pursue their financial objectives.** Evidence the recommended product actually progresses the stated objectives. Red if the link between objective and recommendation is missing or tenuous.

---

## Outcome 1 — Products and Services

**CD-PS-1 — Target market statement present.** The pack must identify the product's target market and explain why the client falls within it. Evidence: Suitability Report §2 or equivalent.

**CD-PS-2 — Product characteristics aligned to client needs.** Product features, term, liquidity, and risk profile must be linked to specific client needs documented in the Fact Find.

**CD-PS-3 — Unsuitable target-market sales flagged.** If the client falls outside the stated target market, the pack must include an explicit "outside target market" rationale signed by the adviser. Absence of this statement for an out-of-target-market client is Red.

**CD-PS-4 — Vulnerable client considerations.** If the client is identified as vulnerable (CD-PS-4a = health, life events, resilience, capability), the pack must show how product suitability was reassessed in light of the vulnerability. Red if vulnerability is flagged but not addressed in the recommendation.

**Template:**

```
CD-PS-1: [RAG] — [one-sentence evidence citation with section reference]
CD-PS-2: [RAG] — [citation]
CD-PS-3: [RAG] — [citation]
CD-PS-4: [RAG] — [citation]
```

---

## Outcome 2 — Price and Value

**CD-PV-1 — Total cost disclosed.** All ongoing charges, initial charges, adviser fees, and any exit charges presented in a single total-cost view.

**CD-PV-2 — Value assessment linked to benefits.** Pack must show what the client receives in return for the total cost (not just the cost itself). A list of charges without a statement of value delivered is Amber.

**CD-PV-3 — Comparison to alternatives or existing arrangement.** For replacement business (transfers, switches), comparison to the existing arrangement's charges and projected values is mandatory. Red if missing on replacement business.

**CD-PV-4 — Fair value rationale.** Explicit adviser statement that the product represents fair value for this client. Must reference the specific client circumstances, not boilerplate.

**CD-PV-5 — No hidden remuneration.** Any non-standard commission, referral fee, or provider incentive must be disclosed. Silence is not disclosure.

---

## Outcome 3 — Consumer Understanding

**CD-CU-1 — Plain-language recommendation.** The central recommendation must be stated in a single sentence the client can understand without specialist knowledge. Red if the recommendation is only expressed in product-specific jargon.

**CD-CU-2 — Risks disclosed in client terms.** Volatility, loss capacity, illiquidity, and any product-specific risks stated in the client's terms — not just regulatory labels. "Capital at risk" alone is Amber; a client-specific loss scenario is Green.

**CD-CU-3 — Client-stated understanding captured.** Evidence the client confirmed understanding of the key risks, ideally with the client's own words. A tick-box confirmation alone is Amber.

**CD-CU-4 — Reasonable-reader test.** Pack is readable by a reasonable member of the target market without specialist training. Excessive jargon, missing glossary, or dense legal paragraphs that obscure the recommendation are Amber or Red.

---

## Outcome 4 — Consumer Support

**CD-CS-1 — Channels to contact the adviser.** Pack must state how the client can contact the adviser for post-sale questions and what response time to expect.

**CD-CS-2 — Ongoing service definition.** If an ongoing service is charged for, the pack must state what the client receives, how often, and how to trigger it.

**CD-CS-3 — Complaints handling signposted.** How to complain, to whom, and the FOS escalation route. Missing or incorrect FOS reference is Red.

**CD-CS-4 — Cancellation and unwind.** Cancellation rights and the consequences of cancelling (including any loss of market value during the cooling-off period) must be disclosed.

---

## What good looks like

**CD-PV-3 Green example:**

> "Existing arrangement: Standard Life Personal Pension, ongoing charge 0.85%. Proposed arrangement: Aviva Workplace Pension, ongoing charge 0.62%. Over 10 years at 5% growth, the charge reduction improves the projected fund by £6,420. See illustration §4."

**CD-CU-2 Green example:**

> "Based on Mrs Chen's £45,000 pension pot and the medium-risk portfolio selected, a 25% market fall would reduce the fund to approximately £33,750. Mrs Chen confirmed at the meeting on 14 March that she could accept a short-term loss of this scale without it affecting her retirement plans."

## What fails

**CD-PV-3 Red example:**

> "The proposed arrangement offers better value for money." — no figures, no comparison, no projection. Fails the evidence requirement for replacement business.

**CD-CS-3 Red example:**

> "If you have a complaint, please contact us." — missing FOS reference, missing escalation timeline, missing written-complaint process. Fails.

---

## Assessment output contract

The Consumer Duty Evaluator must produce output labeled `CD_RAW` in the exact structure:

```
CD_RAW

Cross-Cutting Rules:
CD-X-1: [RAG] — [evidence]
CD-X-2: [RAG] — [evidence]
CD-X-3: [RAG] — [evidence]

Outcome 1 — Products and Services:
CD-PS-1: [RAG] — [evidence]
... (all CD-PS items)

Outcome 2 — Price and Value:
CD-PV-1: [RAG] — [evidence]
... (all CD-PV items)

Outcome 3 — Consumer Understanding:
CD-CU-1: [RAG] — [evidence]
... (all CD-CU items)

Outcome 4 — Consumer Support:
CD-CS-1: [RAG] — [evidence]
... (all CD-CS items)

Overall outcome verdicts:
Products and Services: [RAG]
Price and Value: [RAG]
Consumer Understanding: [RAG]
Consumer Support: [RAG]
```

Every criterion must have a verdict. If evidence is missing in the pack, the verdict is Red and the evidence field states `Not found in pack`. Do not fabricate evidence. Do not paraphrase criterion wording.
