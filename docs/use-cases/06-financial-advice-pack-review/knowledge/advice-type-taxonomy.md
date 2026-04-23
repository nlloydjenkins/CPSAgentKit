# Advice Type Taxonomy

**Version:** 1.0
**Scope:** Pack Classifier and Suitability Policy Evaluator prompt tools.
**Audience:** agent internal.

This document defines the advice types the Helios agent recognises, the signals used to classify a pack into each type, the additional rules that apply, and the out-of-scope types the agent must escalate rather than process.

---

## Recognised Advice Types

Each pack is classified into exactly one advice type. If multiple types appear in a single pack (e.g. a Suitability Report recommending both an ISA and a pension top-up), the agent escalates rather than attempting to score a combined pack — these must be split into separate packs per firm policy.

### AT-PENSION-TRANSFER

**Definition:** advice to transfer pension benefits out of one scheme into another, including defined-benefit to defined-contribution transfers, safeguarded-to-flexible transfers, and SSAS/SIPP transfers with safeguarded benefits.

**Signals in the pack:**

- Transfer Value Analysis (TVA/APTA) document
- Critical yield calculation
- References to "ceding scheme", "receiving scheme", "safeguarded benefits", "guaranteed minimum pension"
- Fact Find section discussing existing scheme benefits to be given up

**Additional rules:**

- `SP-8` (transfer analysis) is mandatory — Red if missing
- Grading Rubric's threshold table: any Red on `SP-8` forces `ESCALATE` regardless of total score
- Pension transfer advice involving safeguarded benefits above £30,000 requires a Pension Transfer Specialist (PTS) sign-off — the Disclosure Checker must find the PTS declaration

### AT-PENSION-ACCUMULATION

**Definition:** pension contributions, consolidation without safeguarded benefits, workplace pension setup, SIPP establishment for accumulation.

**Signals:**

- Contribution schedules, employer contribution details
- No safeguarded-benefit references
- References to annual allowance, carry-forward, tapered annual allowance

**Additional rules:**

- `SP-8` marked N/A
- `SP-9` (tax implications) weighted carefully — pension tax relief rates must be specifically stated

### AT-DRAWDOWN

**Definition:** income drawdown from an existing pension pot, including flexi-access drawdown and UFPLS arrangements.

**Signals:**

- Withdrawal schedule
- Longevity / sustainability modelling
- References to "crystallised", "uncrystallised", "tax-free cash", "25% PCLS"

**Additional rules:**

- `CD-X-2` (foreseeable harm) specifically requires evidence of longevity-risk consideration — Red if fund depletion risk is not addressed
- `SP-5` (affordability) must show a sustainability projection, not just current affordability

### AT-ISA

**Definition:** advice on Individual Savings Accounts — Stocks & Shares ISA, Cash ISA, Lifetime ISA, Innovative Finance ISA.

**Signals:**

- ISA subscription figures
- References to annual ISA allowance, ISA wrapper, transfer-in of existing ISAs

**Additional rules:**

- `SP-8` marked N/A (no safeguarded benefit transfer analysis)
- `SP-9` must specifically address ISA wrapper tax efficiency vs a GIA alternative

### AT-GIA

**Definition:** General Investment Account advice, typically alongside ISA where allowance is exhausted.

**Signals:**

- Reference to CGT exposure, annual CGT allowance, dividend tax
- Bed-and-ISA mention
- Portfolio above ISA allowance

**Additional rules:**

- `SP-9` must specifically address CGT exposure and the annual exemption
- `SP-8` marked N/A

### AT-PROTECTION

**Definition:** advice on life assurance, critical illness, income protection, whole-of-life, family income benefit.

**Signals:**

- Sum assured figures
- Term specification
- Reference to underwriting, exclusions, waiver of premium

**Additional rules:**

- Scoped per firm policy: `SP-2` (ATR), `SP-3` (CFL), `SP-7` (charges comparison), `SP-8`, `SP-9` are N/A
- `CD-PS-4` (vulnerable clients) especially important — health conditions disclosed at underwriting must be reflected in the Fact Find

---

## Out-of-Scope Advice Types

The agent must escalate, not process, packs classified as:

### AT-MORTGAGE (Escalate)

**Definition:** mortgage advice — first charge, buy-to-let, remortgage, equity release.

**Reason:** Helios uses a separate mortgage advice policy and a separate agent pipeline. Processing a mortgage pack with this agent would apply the wrong policy criteria.

**Classifier action:** return `AT-MORTGAGE` and halt the pipeline. The parent topic posts to `#compliance-supervisors` with `OUT_OF_SCOPE_MORTGAGE`.

### AT-CORPORATE (Escalate)

**Definition:** corporate advice — group pensions, key-person insurance, shareholder protection, corporate investment.

**Reason:** different regulatory framework, different policy, not covered by this agent's knowledge base.

**Classifier action:** halt and escalate with `OUT_OF_SCOPE_CORPORATE`.

### AT-UNKNOWN (Escalate)

**Definition:** the pack does not map to any recognised advice type, or the classifier confidence is below the acceptable threshold.

**Reason:** the agent must never apply the wrong rubric by guessing.

**Classifier action:** halt and escalate with `CLASSIFICATION_UNCERTAIN`. Include the top 2 candidate types and the confidence scores in the escalation payload.

---

## Classifier Output Contract

The Pack Classifier returns JSON:

```json
{
  "advice_type": "AT-PENSION-TRANSFER",
  "client_segment": "retail",
  "vulnerability_flag": true,
  "vulnerability_drivers": ["health"],
  "products_recommended": ["Aviva Personal Pension"],
  "existing_arrangements": ["Standard Life Personal Pension"],
  "classifier_confidence": 0.92,
  "classifier_rationale": "TVA present, critical yield calculation 8.2%, DB to DC transfer explicitly named in Suitability Report §1."
}
```

**Confidence thresholds:**

- `≥ 0.80` → proceed with the classified type
- `0.60–0.79` → proceed but flag for human review in the final report
- `< 0.60` → halt and escalate as `AT-UNKNOWN`

**Client segments:**

- `retail` — default; individual client
- `professional` — elective or per se professional client (COBS 3.5)
- `vulnerable` — flagged per CD-PS-4 drivers (health, life events, resilience, capability)

Note: `vulnerable` is both a segment label and a flag. A client may be, for example, a `retail` client with `vulnerability_flag: true`. The Suitability Policy Evaluator uses the flag + drivers to decide how to score `CD-PS-4` and whether extra Fact-Find evidence is required.

---

## Interaction with downstream stages

- **Suitability Policy Evaluator** reads `advice_type` to decide which `SP-*` criteria are applicable vs N/A.
- **Grading Rubric** uses the full verdict set from `CD_RAW` and `SP_RAW` — N/A criteria are excluded from their pillar denominators (see `grading-rubric.md`).
- **Disclosure Checker** is advice-type-aware for `DISC-FSCS` (correct protection category) and `DISC-TAX` (product-specific tax wording).
- **Reporter** includes the advice type and client segment at the top of the report.
