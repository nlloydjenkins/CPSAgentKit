# Application Type Definitions

## Purpose

This document defines the application types that the system handles. Each type specifies its required fields, optional fields, routing destination, and any type-specific compliance or disclosure requirements. The Completeness Assessor uses this document to determine what information is needed, and the parent orchestrator uses the routing rules to assign complete applications to the correct queue.

This is a template with example types. Organisations should replace or extend these with their own application types.

---

## Type: Account Amendment

**Description:** A request to change details on an existing account — such as address, contact details, payment method, or account holder name.

**Required Fields:**

| Field             | Description                        | Extraction Notes                                                                                         |
| ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Applicant Name    | Full name of the account holder    | May appear anywhere in the email or signature                                                            |
| Account Number    | Existing account reference         | Numeric or alphanumeric; may be labelled as "account number," "customer number," "reference," or similar |
| Amendment Details | What the applicant wants to change | Freeform — the agent must interpret the requested change                                                 |

**Optional Fields:**

| Field                    | Description                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effective Date           | When the change should take effect. Only required for change of tenancy amendments. For all other amendments, if not provided assume "as soon as possible" and note this in the record. |
| Reason for Change        | Why the applicant is requesting the change                                                                                                                                              |
| Supporting Documentation | Any attached files (e.g., proof of address)                                                                                                                                             |

**Routing:** Account Services queue.

**Type-Specific Compliance:** If the amendment involves a change of account holder name, the email must include: "For security, we may need to verify your identity before making this change. We will contact you if additional verification is required."

---

## Type: New Application

**Description:** A request to open a new account, enrol in a service, or apply for a product.

**Required Fields:**

| Field               | Description                                  | Extraction Notes                                                            |
| ------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| Applicant Name      | Full name                                    | May appear anywhere in the email or signature                               |
| Contact Email       | Email address for correspondence             | Usually the sender address, but may differ if applying on behalf of someone |
| Application Subject | What the applicant is applying for           | Must be mapped to a known product or service; if unknown, escalate          |
| Relevant Dates      | Start date, preferred date, or date of event | Context-dependent — the agent must determine which date is relevant         |

**Optional Fields:**

| Field                    | Description                        |
| ------------------------ | ---------------------------------- |
| Phone Number             | Alternative contact                |
| Organisation / Employer  | If the application is work-related |
| Supporting Documentation | Attached files                     |

**Routing:** New Business queue.

**Type-Specific Compliance:** First-contact emails must include the data handling disclosure as defined in the Compliance Rules knowledge source, Rule 2.

---

## Type: Cancellation

**Description:** A request to cancel an existing account, service, or product.

**Required Fields:**

| Field               | Description                                              | Extraction Notes                                                                              |
| ------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Applicant Name      | Full name of the account holder                          | —                                                                                             |
| Account Number      | Existing account reference                               | —                                                                                             |
| Cancellation Date   | When the applicant wants the cancellation to take effect | If "immediately," record as today's date                                                      |
| Cancellation Reason | Why the applicant is cancelling                          | Freeform; the agent should capture this even if the applicant offers only a brief explanation |

**Optional Fields:**

| Field                           | Description                                     |
| ------------------------------- | ----------------------------------------------- |
| Final Account Statement Request | Whether the applicant wants a closing statement |

**Routing:** Retentions queue.

**Type-Specific Compliance:** Cancellation acknowledgement emails must include: "If you change your mind, you can contact us within [cooling-off period] to reinstate your account." The cooling-off period should be populated from the product terms.

---

## Type: Enquiry

**Description:** A question or request for information that does not constitute a formal application, amendment, or cancellation. Enquiries are not processed as applications but are logged and responded to.

**Required Fields:**

| Field           | Description                           | Extraction Notes                                                                                               |
| --------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Applicant Name  | Name of the person making the enquiry | —                                                                                                              |
| Enquiry Subject | What the enquiry is about             | Freeform — the agent should categorise broadly (product information, pricing, eligibility, process, complaint) |

**Optional Fields:**

| Field              | Description                                   |
| ------------------ | --------------------------------------------- |
| Account Number     | If the enquiry relates to an existing account |
| Urgency Indicators | Language suggesting time-sensitivity          |

**Routing:** General Enquiries queue. If the enquiry subject is "complaint," route to Complaints queue.

**Type-Specific Compliance:** If the enquiry is categorised as a complaint, the response must include: "We take complaints seriously. We will acknowledge your complaint formally within [X] working days and aim to resolve it within [Y] working days. If you are not satisfied with our response, you can contact [ombudsman / external body]."

---

## Type: Unknown / Ambiguous

**Description:** The Email Interpreter cannot determine the application type with sufficient confidence, or the email appears to contain multiple intents that map to different types.

**Required Fields:** None — this type triggers escalation.

**Routing:** Escalated to human review via Teams adaptive card.

**Escalation Card Content:** The adaptive card should include the Email Interpreter's best-guess type(s) with confidence scores, the original email text, and action buttons allowing the human to assign the correct type and proceed.

---

## Adding New Types

When the organisation introduces a new application type, add an entry to this document following the same structure:

1. **Description** — one paragraph explaining what this type covers.
2. **Required Fields** — table with field name, description, and extraction notes.
3. **Optional Fields** — table with field name and description.
4. **Routing** — which queue receives complete applications of this type.
5. **Type-Specific Compliance** — any disclosures or constraints specific to this type, referencing the Compliance Rules knowledge source where applicable.

Update the Compliance Rules knowledge source if the new type introduces new disclosure requirements.
