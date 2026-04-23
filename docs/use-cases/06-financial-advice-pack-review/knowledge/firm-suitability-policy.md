# Helios Wealth Management — Suitability Policy

**Version:** 1.0
**Scope:** Suitability Policy Evaluator prompt tool only.
**Audience:** agent internal — not for client-facing output.

This document defines the 12 firm-level suitability criteria every Helios advice pack must evidence. The Suitability Policy Evaluator cites the criterion ID (e.g. `SP-4`) in every verdict. No policy judgement may rely on general model knowledge — only this document and the uploaded pack.

Content is illustrative of a typical UK IFA suitability policy. The firm's compliance officer must review and sign off the production version.

---

## The 12 Criteria

### SP-1 — Client objectives documented

The Fact Find must capture the client's stated objectives in the client's own words, with a stated time horizon and a priority ranking if more than one objective. A generic "growth" or "retirement planning" objective without context is Amber. Missing objectives are Red.

### SP-2 — Attitude to Risk (ATR) documented

An ATR questionnaire result must be present, dated within 12 months, with a documented discussion about whether the questionnaire result matches the client's own view. ATR without discussion is Amber. Missing ATR is Red.

### SP-3 — Capacity for Loss (CFL) assessed separately from ATR

CFL is a separate assessment from ATR and must consider the client's ability to absorb loss in pounds, not just in percentage terms. CFL conflated with ATR in a single statement is Amber. Missing CFL is Red.

### SP-4 — Existing arrangements considered

Every existing pension, investment, or protection arrangement relevant to the objective must be listed, with current value, charges, and features. For replacement business, a side-by-side comparison is mandatory. Missing existing-arrangement consideration for replacement business is Red.

### SP-5 — Affordability confirmed

For new contributions, drawdown, or regular premiums, the pack must show an affordability analysis referencing the client's income, outgoings, and emergency fund. A signed affordability statement without supporting figures is Amber.

### SP-6 — Term and liquidity aligned

The product term and liquidity profile must align with the client's time horizon and any known liquidity needs (e.g. house purchase, retirement date). Misalignment without mitigation is Red.

### SP-7 — Charges comparison shown

For any new product or replacement, the total charges must be shown alongside at least one comparable alternative or the existing arrangement. Pension transfers require the Transfer Value Comparator (TVC) for safeguarded benefits.

### SP-8 — Pension transfer analysis where applicable

If the advice involves a defined-benefit pension transfer or any safeguarded-benefit transfer, the pack must include a Transfer Value Analysis (TVA/APTA) and a critical yield calculation. Transfer advice without this analysis is Red.

### SP-9 — Tax implications stated

Expected tax treatment must be stated: ISA wrapper efficiency, pension tax relief / lifetime allowance, CGT exposure, income tax on withdrawals. Generic "tax-efficient" phrasing without specifics is Amber.

### SP-10 — Sustainability preferences captured

The pack must evidence a conversation about the client's ESG / sustainability preferences and how the recommendation reflects them (or a client-stated preference not to consider). Silence is Amber.

### SP-11 — Adviser declaration signed and dated

The adviser must sign and date a declaration that the recommendation is suitable, that they have considered the alternatives, and that they have no conflicts of interest. Missing or undated is Red.

### SP-12 — Client declaration signed and dated

The client must sign a declaration confirming they understand the recommendation, the risks, and the costs. Tick-box only without client signature is Amber. Missing client signature is Red.

---

## Scope notes

- **Pension transfers** additionally require SP-8. The Pack Classifier output indicates whether this applies; the Suitability Policy Evaluator must check `Topic.PackClassification.AdviceType` before deciding whether an SP-8 verdict is required. For non-transfer advice, SP-8 is marked `N/A` rather than Green.
- **Protection-only advice** is scoped differently: SP-2, SP-3, SP-7, SP-8 and SP-9 are assessed as N/A. The adviser must still evidence SP-1, SP-4, SP-5, SP-6 (where term applies), SP-10, SP-11, SP-12.
- **Mortgage advice** uses a separate policy document and this pack review agent does not process mortgage advice. Escalate if Pack Classifier returns `mortgage`.

---

## What good looks like

**SP-3 Green example:**

> "Mrs Chen's current fund is £120,000. She confirmed she could absorb a short-term loss of up to £24,000 (20%) without affecting her planned retirement income, but a loss of £40,000+ would require her to delay retirement. This CFL is recorded separately from her 'medium' ATR result."

**SP-8 Green example:**

> "Transfer Value Analysis performed 12 March 2026. Transfer value £145,000. Critical yield to match scheme benefits: 8.2%. Recommended growth assumption: 4.5%. Shortfall acknowledged and discussed. Recommendation based on client's prioritisation of flexibility and death benefits over guaranteed income — see Fact Find §6."

## What fails

**SP-4 Red example:**

> "The client has an existing pension." — no provider, no value, no charges, no comparison. Fails on replacement business.

**SP-11 Red example:**

> Adviser declaration present but undated. Fails — must be dated.

---

## Output contract

The Suitability Policy Evaluator must produce output labeled `SP_RAW`:

```
SP_RAW

SP-1: [RAG|N/A] — [evidence]
SP-2: [RAG|N/A] — [evidence]
SP-3: [RAG|N/A] — [evidence]
SP-4: [RAG|N/A] — [evidence]
SP-5: [RAG|N/A] — [evidence]
SP-6: [RAG|N/A] — [evidence]
SP-7: [RAG|N/A] — [evidence]
SP-8: [RAG|N/A] — [evidence]
SP-9: [RAG|N/A] — [evidence]
SP-10: [RAG|N/A] — [evidence]
SP-11: [RAG|N/A] — [evidence]
SP-12: [RAG|N/A] — [evidence]

Policy summary:
Applicable criteria: [count]
Green: [count]
Amber: [count]
Red: [count]
N/A: [count]
```

All 12 criteria must appear. Missing evidence = Red with `Not found in pack`. Never fabricate evidence. Never paraphrase criterion IDs.
