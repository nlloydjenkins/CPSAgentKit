# Required Disclosures Checklist

**Version:** 1.0
**Scope:** Disclosure Checker prompt tool only.
**Audience:** agent internal.

This document lists every disclosure that must appear in a Helios advice pack, along with the prescribed wording pattern and the regulatory reference. The Disclosure Checker cites the disclosure ID (e.g. `DISC-FSCS`) in every verdict. Disclosures are binary: Green (present and correct), Amber (present but incorrect wording or outdated figures), or Red (missing).

Content is illustrative. Production wording must be signed off by the firm's compliance officer.

---

## Disclosure IDs

### DISC-CANCEL — Cancellation Rights

**Required:** A statement of the client's right to cancel, the length of the cancellation period, how to exercise it, and the consequences (including potential loss of market value).

**Minimum pattern:**

> "You have the right to cancel this [product] within [30/14] days of receiving the policy documents. To cancel, [method]. If you cancel within the cancellation period, [consequences, including any market-value reduction that may apply for unit-linked products]."

**Regulatory reference:** COBS 15 / ICOBS 7.

**Amber triggers:** correct framework but period stated incorrectly (e.g. 14 days for a 30-day product); consequences omitted.

**Red triggers:** disclosure absent entirely.

---

### DISC-COMPLAINTS — Complaints Handling

**Required:** How to complain, to whom, the firm's commitment to respond, and the FOS escalation route including the 8-week trigger.

**Minimum pattern:**

> "If you are unhappy with any aspect of our service, please contact [named contact / complaints team] at [channel]. We will acknowledge your complaint within [X] business days and aim to resolve it within 8 weeks. If we cannot resolve your complaint to your satisfaction, or if 8 weeks have passed, you have the right to refer the matter to the Financial Ombudsman Service at financial-ombudsman.org.uk or 0800 023 4567."

**Regulatory reference:** DISP 1.

**Amber triggers:** FOS reference missing or incorrect URL/phone; 8-week trigger not stated; no named contact or channel.

**Red triggers:** disclosure absent entirely.

---

### DISC-FSCS — Financial Services Compensation Scheme

**Required:** FSCS protection statement relevant to the product type, with the correct protection limit as at the pack date.

**Current limits (update this document when FSCS limits change):**

- **Deposits:** £85,000 per person per authorised firm
- **Investments:** £85,000 per person per firm
- **Pensions (long-term insurance contracts):** 100% with no upper limit for eligible claims
- **Insurance (general):** varies by contract type

**Minimum pattern:**

> "Your [product] may be covered by the Financial Services Compensation Scheme (FSCS). If [provider] is unable to meet its obligations, you may be entitled to compensation up to [relevant limit]. Further information is available at fscs.org.uk or 0800 678 1100."

**Amber triggers:** outdated limit (e.g. `£75,000 for investments` or pre-April 2024 figures), wrong protection category cited, FSCS URL/phone incorrect.

**Red triggers:** disclosure absent.

---

### DISC-CHARGING — Adviser Charging Structure

**Required:** The total adviser charge expressed in both percentage and cash terms, split between initial and ongoing, with the payment mechanism stated.

**Minimum pattern:**

> "Our advice fees for this recommendation are: initial charge of [X%] (£[Y]) and ongoing charge of [Z%] per annum (£[W] in year 1). The initial charge will be [deducted from the investment / invoiced separately]. You may cancel the ongoing service at any time by [method]."

**Regulatory reference:** COBS 6.1A.

**Amber triggers:** percentage without cash equivalent; ongoing service cancellation method not stated; mechanism unclear.

**Red triggers:** charging structure missing; only percentages with no cash equivalent anywhere in the pack.

---

### DISC-CONFLICTS — Conflicts of Interest

**Required:** An explicit statement that the adviser has considered conflicts of interest, has none, or has disclosed them.

**Minimum pattern:**

> "I have considered whether any conflicts of interest apply to this recommendation. [Either: 'I have no conflicts of interest to disclose.' OR: 'The following conflicts apply: [list] and have been managed as follows: [mitigation]']."

**Regulatory reference:** COBS 2.1, SYSC 10.

**Amber triggers:** generic conflict statement not tailored to this recommendation (e.g. firm-wide boilerplate only); conflicts mentioned but mitigation not stated.

**Red triggers:** no conflicts statement at all.

---

### DISC-INDEPENDENCE — Advice Status

**Required:** A statement of whether the advice is independent or restricted, as defined by FCA rules.

**Minimum pattern:**

> "Helios Wealth Management provides [independent / restricted] financial advice. [If restricted: 'Our recommendations are based on a limited range of providers. The panel is: [list] and was selected based on [criteria].']"

**Regulatory reference:** COBS 6.2B.

**Amber triggers:** status stated but panel not listed (for restricted advice); contradictory statements elsewhere in the pack.

**Red triggers:** independence status not stated.

---

### DISC-TAX — Tax Disclosure and Reliance

**Required:** A statement that tax treatment depends on individual circumstances and may change, with a specific application to this recommendation.

**Minimum pattern:**

> "The tax treatment described in this recommendation is based on our understanding of current legislation and HMRC practice. Tax treatment depends on your individual circumstances and may change. Specifically for this recommendation: [product-specific tax note — e.g. pension tax relief rates, ISA annual allowance, CGT exemption assumed]."

**Amber triggers:** boilerplate present but no product-specific tax note.

**Red triggers:** disclosure absent.

---

### DISC-RISKS — Risk Warning Block

**Required:** Product-appropriate risk warnings, including that capital is at risk, past performance is not a reliable indicator, and any product-specific risks (drawdown longevity, transfer irreversibility, etc.).

**Minimum pattern:**

> "The value of investments can go down as well as up. You may get back less than you invested. Past performance is not a reliable indicator of future results. [Product-specific risk: e.g. 'If you transfer out of your defined-benefit pension, you will lose the guaranteed income for life that the scheme provides, and this decision is generally irreversible.']"

**Amber triggers:** generic risk block without product-specific warning.

**Red triggers:** no risk block.

---

## Output contract

The Disclosure Checker must produce output labeled `DC_RAW`:

```
DC_RAW

DISC-CANCEL: [G|A|R] — [evidence: quote or "Not found in pack"]
DISC-COMPLAINTS: [G|A|R] — [evidence]
DISC-FSCS: [G|A|R] — [evidence, including limit figure if present]
DISC-CHARGING: [G|A|R] — [evidence]
DISC-CONFLICTS: [G|A|R] — [evidence]
DISC-INDEPENDENCE: [G|A|R] — [evidence]
DISC-TAX: [G|A|R] — [evidence]
DISC-RISKS: [G|A|R] — [evidence]

Disclosure summary:
Green: [n]
Amber: [n]
Red: [n]
```

For every Amber or Red, the evidence field must state exactly what is wrong (e.g. `FSCS limit stated as £75,000 — should be £85,000 for investments as at April 2024`). Never fabricate wording. Never mark Green without quoting the relevant disclosure text from the pack.
