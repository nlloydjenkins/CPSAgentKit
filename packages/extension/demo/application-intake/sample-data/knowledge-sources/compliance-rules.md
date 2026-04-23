# Compliance Rules – Outbound Email Evaluation

## Purpose

This document defines the compliance rules that the Compliance Evaluator agent checks against every outbound email before it is sent. Each rule includes a description, the rationale, examples of pass and fail, and the action the evaluator should take on failure.

The Compliance Evaluator does not rewrite emails. It returns a pass/fail verdict per rule, and on failure, provides specific revision instructions to the Correspondence Drafter.

---

## Rule Index

| # | Rule Name | Severity | Scope |
|---|---|---|---|
| 1 | No Unauthorised Commitments | Critical | All outbound emails |
| 2 | Required Disclosures Present | Critical | All outbound emails |
| 3 | No Data Leakage | Critical | All outbound emails |
| 4 | Tone and Fairness | Major | All outbound emails |
| 5 | No Unexplained Jargon | Major | All outbound emails |
| 6 | Accurate Applicant Details | Major | All outbound emails |
| 7 | No Speculative Timelines | Moderate | All outbound emails |
| 8 | Correct Regulatory References | Critical | Emails citing regulations |

Severity levels determine behaviour on failure:

- **Critical** — email must not be sent. Draft returns to Correspondence Drafter for revision.
- **Major** — email must not be sent. Draft returns to Correspondence Drafter for revision.
- **Moderate** — email may be sent with a logged warning, but revision is preferred.

---

## Rule 1: No Unauthorised Commitments

### Description

The email must not promise, guarantee, or imply a specific outcome, decision, approval, timescale, or exception unless that commitment is explicitly listed in the Authorised Commitments table below.

### Rationale

Under FCA Consumer Duty (Principle 12), communications must be clear, fair, and not misleading. An agent-generated email that implies a guaranteed approval or a specific decision timescale creates a binding expectation the organisation may not be able to meet.

### Authorised Commitments

The following commitments may be made in outbound emails. Any commitment not on this list is unauthorised.

| Commitment | Permitted Phrasing |
|---|---|
| Acknowledgement of receipt | "We have received your application." |
| Processing time estimate | "We aim to process your application within [X] working days." Use "aim to" — never "will" or "guarantee." |
| Chase deadline | "If we do not hear from you by [date], we may close your application." Use "may" — never "will." |
| Contact availability | "You can reach us at [contact details] during [hours]." |
| Next step description | "Once we have the information, we will review your application." This describes process, not outcome. |

### Examples

**Pass:** "We aim to process your application within 5 working days of receiving all required information."

**Fail:** "Your application will be approved within 5 working days." (Guarantees an outcome.)

**Fail:** "We will definitely have this resolved by Friday." (Commits to a specific timescale without "aim to.")

**Fail:** "Don't worry, this should be straightforward and shouldn't take long." (Implies ease/speed of a decision the organisation may not control.)

### Revision Instruction Template

"The draft contains an unauthorised commitment in the following sentence: '[sentence]'. Revise to use permitted phrasing from the Authorised Commitments list. If no permitted phrasing applies, remove the commitment and replace with a factual description of the next step."

---

## Rule 2: Required Disclosures Present

### Description

Certain types of outbound email must include specific disclosure statements. The Compliance Evaluator checks whether the required disclosures for the email type are present.

### Required Disclosures by Email Type

| Email Type | Required Disclosure |
|---|---|
| All outbound emails | Organisation name, contact details, and reference number. |
| First contact (acknowledgement or info request) | Data handling statement: "We will use the information you provide to process your application. For details on how we handle your data, see [link to privacy policy]." |
| Chase / follow-up emails | Statement of consequence: "If we do not receive the requested information by [date], we may need to close your application. You can reapply at any time." |
| Rejection or closure emails | Right to appeal or complain: "If you disagree with this decision, you can [appeal process / complaints contact]." |
| Emails involving financial products (if applicable) | Regulatory status disclosure: "[Organisation name] is authorised and regulated by the Financial Conduct Authority (FCA), reference number [number]." |

### Examples

**Pass:** An acknowledgement email includes the data handling statement and the organisation's contact details.

**Fail:** An acknowledgement email is sent without a data handling statement.

**Fail:** A chase email does not state the consequence of non-response.

### Revision Instruction Template

"The draft is missing the following required disclosure(s) for a [email type] email: [list of missing disclosures]. Add the disclosure(s) at the end of the email before the sign-off, using the standard phrasing from the Required Disclosures table."

---

## Rule 3: No Data Leakage

### Description

The email must not contain information that belongs to a different applicant, references internal-only systems or processes by name, or includes details the recipient has not themselves provided or would not reasonably expect to see.

### Specific Checks

- **Cross-applicant contamination**: The email must not reference names, account numbers, dates, or details that do not match the current applicant's record. This can occur if the agent processes multiple applications in sequence and carries context between them.
- **Internal system references**: The email must not mention Dataverse table names, internal queue names, agent names, confidence scores, escalation reasons, or any other system-level detail. The applicant should not know their case was "escalated" or "triaged."
- **Excessive detail**: The email must not include more information about the applicant than is necessary for the specific communication. If the email is requesting a missing account number, it should not also recite the applicant's full address, date of birth, and previous application history.

### Examples

**Pass:** "We need your account number to continue processing your application APP-2026-0847."

**Fail:** "We need your account number. We note that John Smith (APP-2026-0846) submitted a similar application yesterday." (References another applicant.)

**Fail:** "Your application has been placed in the High Priority queue and assigned to the Financial Products team." (Exposes internal routing.)

**Fail:** "Our system extracted your name and date of birth with 92% confidence." (Exposes system internals.)

### Revision Instruction Template

"The draft contains a data leakage issue: [description of the leak]. Remove the following content: '[content to remove]'. Replace with [suggested neutral alternative] or omit entirely."

---

## Rule 4: Tone and Fairness

### Description

The email must be neutral, professional, and respectful. It must not blame, pressure, threaten, or patronise the recipient. Under FCA Consumer Duty, communications must be clear, fair, and not misleading.

### Specific Checks

- **No blame language**: Do not imply the applicant has done something wrong. "We still need a few details" not "You failed to provide the required information."
- **No pressure or urgency without basis**: Do not create false urgency. "Please respond at your earliest convenience" is acceptable. "Failure to respond immediately may result in adverse consequences" is not, unless a genuine regulatory deadline applies.
- **No threatening language**: Do not imply negative consequences beyond what is factually accurate. "We may need to close your application" is factual. "Your application will be permanently rejected" implies a severity that may not be warranted.
- **No patronising language**: Do not over-explain obvious points or use a tone that implies the reader lacks intelligence. Clarity and simplicity are not the same as condescension.
- **No emotional manipulation**: Do not use phrases designed to induce guilt or anxiety. "We understand this must be frustrating" is empathetic. "We have been waiting a long time for your response" is guilt-inducing.

### Examples

**Pass:** "We need your account number to continue. Please reply by 26 March 2026."

**Fail:** "You have failed to supply the required documentation despite our previous request." (Blame.)

**Fail:** "This matter requires your urgent and immediate attention to avoid serious consequences." (Pressure without basis.)

**Fail:** "As we have explained in our previous communications, we cannot proceed without this information." (Patronising — implies the reader didn't understand the first time.)

### Revision Instruction Template

"The draft contains a tone issue in the following sentence: '[sentence]'. The issue is: [blame / pressure / threat / patronising / emotional manipulation]. Revise to use neutral, factual language. Suggested alternative: '[suggested phrasing]'."

---

## Rule 5: No Unexplained Jargon

### Description

The email must not use technical, legal, regulatory, or organisational jargon without explanation. If a term must be used (e.g., a form name or regulatory reference), it must be explained in context on first use.

### Examples

**Pass:** "Please complete form AP-3 (the account change request form) and return it to us."

**Fail:** "Please submit your AP-3 at your earliest convenience." (Unexplained form reference.)

**Fail:** "Your application is pending KYC verification." (Unexplained acronym.)

**Pass:** "We need to verify your identity before we can continue. This is called Know Your Customer (KYC) verification and is a legal requirement."

### Revision Instruction Template

"The draft contains unexplained jargon: '[term]'. Either replace with a plain English equivalent or explain the term on first use. Suggested alternative: '[suggested phrasing]'."

---

## Rule 6: Accurate Applicant Details

### Description

Any applicant details referenced in the email (name, reference number, account number, dates) must match the current application record. The Compliance Evaluator cross-references details in the draft against the structured data provided by the parent orchestrator.

### Examples

**Pass:** Email addresses the applicant as "Mr Thompson" and references "APP-2026-0847" — both match the record.

**Fail:** Email addresses the applicant as "Mr Thomson" when the record shows "Thompson." (Name mismatch — could indicate cross-applicant contamination or a transcription error.)

### Revision Instruction Template

"The draft contains an applicant detail mismatch: the draft says '[draft value]' but the application record shows '[record value]'. Correct the draft to match the record. If the discrepancy suggests cross-applicant contamination, flag for human review."

---

## Rule 7: No Speculative Timelines

### Description

The email must not state or imply timelines that are not defined in the organisation's published service standards. Vague time references ("shortly," "soon," "in due course") are prohibited because they create an unmeasurable expectation.

### Permitted Timeline Language

| Situation | Permitted Phrasing |
|---|---|
| Standard processing | "We aim to process your application within [X] working days." (Where X is defined in service standards.) |
| Unknown timeline | "We will contact you when we have an update." |
| Waiting for external input | "This depends on [external party]. We will follow up with them and let you know." |

### Examples

**Pass:** "We aim to review your application within 10 working days."

**Fail:** "We will get back to you shortly." (Undefined timeline.)

**Fail:** "This should only take a couple of days." (Informal, unmeasurable, implies speed that may not be accurate.)

### Revision Instruction Template

"The draft contains a speculative timeline: '[sentence]'. Replace with a specific working-day estimate from the service standards, or use 'We will contact you when we have an update' if no standard applies."

---

## Rule 8: Correct Regulatory References

### Description

If the email cites a regulation, act, or regulatory body, the reference must be accurate and current. Incorrect regulatory references undermine trust and may constitute a misleading communication under FCA Consumer Duty.

### Examples

**Pass:** "Under the General Data Protection Regulation (GDPR), you have the right to request a copy of the data we hold about you."

**Fail:** "Under the Data Protection Act 1998, you have the right to..." (Superseded by GDPR and the Data Protection Act 2018.)

### Revision Instruction Template

"The draft contains an incorrect or outdated regulatory reference: '[reference]'. The current correct reference is: '[correct reference]'. Update the draft accordingly."

---

## Evaluation Process

For each outbound email, the Compliance Evaluator:

1. Receives the draft email and the applicant's structured data from the parent orchestrator.
2. Evaluates the draft against each applicable rule.
3. Returns a structured verdict:
   - **Overall**: Pass or Fail.
   - **Per-rule results**: Pass, Fail, or Not Applicable (for rules that only apply to certain email types).
   - **For each failure**: The rule number, the failing sentence or content, and the revision instruction.
4. If the overall verdict is Fail, the parent orchestrator passes the revision instructions to the Correspondence Drafter for a second attempt. The revised draft is re-evaluated.
5. If the draft fails after two revision cycles, the email is escalated to human review with the full evaluation history.

---

## Maintenance

This rule set is a living document. Rules should be reviewed and updated when:

- The organisation's service standards change (affects Rules 1 and 7).
- Regulatory requirements change (affects Rules 2 and 8).
- New patterns of compliance failure are observed in the evaluation history (may warrant new rules).
- The organisation expands into new application types with type-specific compliance requirements.
