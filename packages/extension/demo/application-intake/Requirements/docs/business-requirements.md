# Application Intake Agent — Business Requirements

## Background

An organisation receives freeform email applications to a shared mailbox (`applications@contoso.com`). Staff currently read each email, re-key data into a case management system, chase applicants for missing documents, and forward edge cases to colleagues. Average first-response time is 2 business days; the target is under 15 minutes for acknowledgement.

The solution should use multiple specialist agents coordinated by a parent orchestrator. Each stage of the intake pipeline — interpretation, completeness assessment, drafting, compliance evaluation, and accessibility formatting — is owned by a dedicated child agent. All outbound correspondence must pass through a compliance check and an accessibility reformat before sending.

## Primary Users

- **Applicants** — members of the public who email the shared mailbox. They never interact with the agent directly; they only see the outbound emails.
- **Operations staff** (8 analysts) who review escalated cases via a Teams channel and a Dataverse-backed model-driven Power App.

## What the Solution Should Do

1. **Monitor a shared mailbox** for new application emails and replies on existing threads. This is event-driven (mailbox trigger), not user-initiated chat.
2. **Interpret freeform email content** into structured fields: applicant name, account number, dates, contact details, application type, intent, urgency signals, and per-field confidence scores. Use the **Email Interpreter** child agent.
3. **Preprocess supported email attachments** (PDF, DOCX) into text/Markdown before downstream AI assessment. Use a prompt tool with code interpreter.
4. **Assess completeness** against the application type's required fields. Return one of three verdicts: `PROCEED`, `REQUEST_INFO`, or `ESCALATE`. Use the **Completeness Assessor** child agent.
5. **Draft contextual correspondence** — acknowledgements for complete applications, information requests listing exactly the missing fields, and chase emails for non-responsive applicants. Reference what the applicant already provided so they don't repeat themselves. Use the **Correspondence Drafter** child agent.
6. **Evaluate every outbound draft** against a configurable compliance rule set before sending. Rules cover: no unauthorised commitments, required disclosures present, no data leakage, neutral tone, no jargon, accurate applicant details, no speculative timelines, correct regulatory references. Use the **Compliance Evaluator** child agent. Maximum 2 revision cycles before escalation.
7. **Reformat compliance-approved drafts** for accessibility and readability: target reading age 9–11, short paragraphs, plain English, dyslexia-friendly structure, action-first layout. Use the **Accessibility Presenter** child agent.
8. **Store all case data in Dataverse** — application records, extracted fields, correspondence logs, and compliance check audit trails.
9. **Handle multi-turn email threads** — merge newly supplied information, preserve previously captured values, and detect contradictions (which trigger escalation, not silent overwrite).
10. **Escalate to human review** via Teams adaptive card when: confidence is low, fields are contradictory, compliance fails after 2 revision cycles, or chase attempts are exhausted.
11. **Run a daily chase scan** — find applications where `Status = Awaiting Applicant` and `NextChaseDate <= Today`, draft a chase email (through the full compliance + accessibility loop), or escalate if the chase limit is reached.

## What the Solution Should NOT Do

- Send any draft directly without the compliance evaluation and accessibility formatting loop.
- Promise approvals, outcomes, or timescales not explicitly authorised by the compliance rules.
- Expose internal routing names, confidence scores, queue names, Dataverse details, or agent internals to applicants.
- Overwrite human-corrected extracted values when later emails arrive on the same thread.
- Silently resolve contradictory applicant data — contradictions require escalation.
- Rely on general model knowledge for policy, compliance, disclosure, or routing decisions.
- Assume unsupported file types or unreadable attachments can be interpreted — those must escalate.
- Create or modify application records without going through the interpretation and assessment pipeline first.

## Success Criteria

- A complete application email is classified, stored in Dataverse, routed to the right queue, and acknowledged with a compliant accessible email — all within 5 minutes.
- A partially complete email triggers a reply listing only the missing fields, confirming what was already received, with required disclosures included.
- A reply that contradicts a previously captured value (e.g., different account number) is flagged and escalated to Teams — never silently overwritten.
- A draft that says "your application will be approved within 5 working days" is rejected by compliance with a specific revision instruction.
- A dense formal draft is reformatted into short paragraphs, plain English, and action-first structure without changing any compliance-approved content.
- After the configured chase limit with no reply, the case moves to a no-response escalation path.

## Tone and Behaviour

- Professional but approachable in all outbound correspondence.
- Never blame the applicant for incomplete information ("We still need a few details" not "You failed to provide...").
- Clear, factual, and non-threatening. Comply with FCA Consumer Duty "clear, fair, and not misleading" standard.
- Target reading age of 9–11 for all outbound email.
- Never fabricate disclosures, commitments, or policy claims.

## Languages

- English only (event triggers are English (en-US) only; generative orchestration itself supports ~40 languages).

## Compliance and Data

- All correspondence and compliance check results logged in Dataverse for audit.
- No personal data shared between different applicants' cases.
- Content moderation should be set to Low in the portal — the domain includes regulatory and compliance wording that may trigger false positives at higher levels.
- General knowledge and web browsing disabled. All answers from tools, knowledge sources, and Dataverse state only.
