# Use Case 2 — Application Intake Agent

## Background

An organisation receives freeform email applications to a shared mailbox (`applications@contoso.com`). Staff currently read each email, re-key data into a case system, chase applicants for missing documents, and forward edge cases to colleagues. Average first-response time is 2 business days; the target is under 15 minutes for acknowledgement.

The solution is autonomous (event-driven by the mailbox), not chat-based. A parent orchestrator coordinates the pipeline: interpretation → completeness assessment → drafting → compliance evaluation → accessibility reformat. All outbound correspondence passes through the compliance and accessibility stages before sending.

Because every stage in this pipeline produces strict structured output (labeled blocks, numbered criteria, fixed templates) and CPS generative orchestration summarises child-agent responses between stages, the specialist stages are implemented as **prompt tools invoked sequentially from a single topic on the parent**, not as child agents. This preserves structure verbatim across stages. Child agents remain an option only where a stage needs its own independent knowledge scope, tools, or governance.

## Build-Time Configuration

The Contoso/sample values are placeholders. During Build, Agent Workbench must ask the maker to confirm or replace the tenant-specific values before finalising tenant-bound schema names, prompt instructions, connector descriptions, or portal setup steps. Missing values should block only the specific tenant-bound action that needs them; Build should still perform safe work that does not depend on those values:

- Shared application mailbox, default `applications@contoso.com`
- Operations service account / trigger owner
- Operations Teams team/channel for escalations
- Dataverse publisher prefix and table logical names if not using `cr85a_`
- Application type list, required-field rules, and chase limits
- Knowledge documents (application types, compliance rules, accessibility standards) to upload directly to Copilot Studio
- Outbound shared-mailbox send identity and audit-retention requirement

## Primary Users and Channel

- **Applicants** (members of the public) — email the shared mailbox. They never chat with the agent; they only see outbound emails.
- **Operations staff** (8 analysts) — review escalated cases via a Teams channel and a Dataverse model-driven Power App.
- Authenticated trigger owner: operations service account in Entra ID

## What the Solution Should Do

1. **Monitor a shared mailbox** for new application emails and replies on existing threads. Autonomous trigger on the parent agent — not user-initiated.
2. **Preprocess attachments** (PDF, DOCX) into text/Markdown via a **prompt tool with code interpreter** before downstream reasoning. Unsupported types escalate. Code interpreter is stdlib-only — no `pandas`, `bs4`, `requests` etc.
3. **Interpret freeform email** into structured fields via the **Email Interpreter prompt tool**: applicant name, account number, dates, contact details, application type, intent, urgency signals, per-field confidence scores. Return JSON captured by `predictionOutput` and parsed downstream. For any field not present in the source, return the literal string `"N/A"` (never empty string or null) to prevent the orchestrator prompting the user mid-pipeline.
4. **Assess completeness** against the application type's required fields via the **Completeness Assessor prompt tool**. Return `PROCEED`, `REQUEST_INFO`, or `ESCALATE`.
5. **Draft correspondence** via the **Correspondence Drafter prompt tool** — acknowledgements, information requests listing only the missing fields, chase emails. Reference what the applicant already provided.
6. **Evaluate every outbound draft** via the **Compliance Evaluator prompt tool** against a configurable rule set: no unauthorised commitments, required disclosures present, no data leakage, neutral tone, accurate applicant details, no speculative timelines, correct regulatory references. Maximum 2 revision cycles before escalation.
7. **Reformat compliance-approved drafts** via the **Accessibility Presenter prompt tool**: target reading age 9–11, short paragraphs, plain English, action-first layout.
8. **Store all case data in Dataverse** — application records, extracted fields, correspondence logs, compliance check audit trails. Use pre-bound "Add a new row" connector actions — one per target table (`cr85a_applications`, `cr85a_correspondences`, `cr85a_compliancechecks`) — not the generic dynamic-schema action (which binds to the first table per conversation and fails with `UnresolvedDynamicType` on the second).
9. **Handle multi-turn email threads** — merge new information into existing records, preserve previously captured values, detect contradictions (escalate, never silently overwrite).
10. **Escalate to humans** via Teams adaptive card when: confidence is low, fields are contradictory, compliance fails after 2 revisions, or chase attempts exhausted.
11. **Run a daily chase scan** — scheduled trigger finds `Status = Awaiting Applicant` and `NextChaseDate <= Today`, drafts a chase email through the full pipeline, or escalates when limit reached. Scheduled triggers can only be owned by the top-level parent agent.

## What the Solution Should NOT Do

- Send any draft directly without the compliance + accessibility loop
- Promise approvals, outcomes, or timescales not authorised by compliance rules
- Expose internal routing names, confidence scores, queue names, or agent internals to applicants
- Overwrite human-corrected values when later emails arrive on the same thread
- Silently resolve contradictions — they always escalate
- Use general knowledge for policy, compliance, disclosure, or routing decisions
- Assume unreadable attachments — they must escalate

## Success Criteria

- A complete application email is classified, stored, routed, and acknowledged within 5 minutes
- Partial emails trigger a reply listing only the missing fields, acknowledging what was received, with required disclosures
- Contradictions (e.g., different account number on a later email) escalate to Teams — never silently overwritten
- A draft containing "your application will be approved within 5 working days" is rejected by compliance with a specific revision instruction
- Dense formal drafts are reformatted into plain English without losing compliance-approved content
- After the chase limit with no reply, the case moves to a no-response escalation path

## Systems and Tools

- **Trigger:** Office 365 Outlook — shared mailbox event trigger (parent agent)
- **Attachment preprocessor:** prompt tool with code interpreter (stdlib-only sandbox; authored in AI Hub, scaffolded into CPS)
- **Specialist stages:** AI Builder prompt tools invoked from a single `AdaptiveDialog` topic on the parent (Email Interpreter, Completeness Assessor, Correspondence Drafter, Compliance Evaluator, Accessibility Presenter). Prompts are created in AI Hub / Copilot Studio first, then synced locally.
- **Case store:** Dataverse — `cr85a_applications`, `cr85a_correspondences`, `cr85a_compliancechecks` tables via **pre-bound** "Add a new row" connector actions (one per table; generic dynamic action is disabled/removed)
- **Knowledge:** uploaded directly to Copilot Studio (no SharePoint dependency), each file scoped to the prompt tool that uses it:
  - `application-type-definitions.md` — scoped to the Email Interpreter and Completeness Assessor prompt tools
  - `compliance-rules.md` — scoped to the Compliance Evaluator prompt tool
  - `accessibility-standards.md` — scoped to the Accessibility Presenter prompt tool
- **Outbound email:** Office 365 Outlook — Send email from shared mailbox
- **Escalation:** Microsoft Teams — Post adaptive card and wait for response
- **Scheduled chase:** daily schedule trigger on parent

## Platform Considerations

- **Prompt tools, not child agents, for the specialist pipeline.** Child agents' responses are summarised between stages, which destroys labeled-block / numbered-criteria structure. This has been empirically verified in production (~30–50% criterion loss with child agents, 100% coverage with prompt tools). Use prompt tools invoked from a single topic for all structured-output stages.
- **Scheduled triggers on the parent only.** Child agents cannot own autonomous triggers.
- **Pre-bound Dataverse actions per table.** The generic "Add a new row" binds to the first table's schema per conversation and fails on the second table. Create one pre-bound action per target table in the portal, give each a unique `modelDisplayName`, then disable the generic action.
- **Dataverse choice columns are integers.** Status, Priority, Compliance Outcome and any other choice fields require integer values (e.g. `100000000`) — never text labels. Include the mappings in both agent instructions and connector action input descriptions.
- **N/A sentinel for optional fields.** The Email Interpreter prompt must return `"N/A"` (literal string) for any field not found — never empty string or null. CPS treats empty string as "unresolved" and breaks into interactive mode even in autonomous runs. The flow that writes to Dataverse checks for `"N/A"` and preserves existing values.
- **Every dynamic connector input needs a description.** A single undescribed `AutomaticTaskInput` on any action poisons all inputs on that tool and causes the orchestrator to prompt. Every input description must state value source, format, and "never ask the user".
- **Anti-termination instructions are required.** Generative orchestration treats any stage output as a potential final answer. Add a CRITICAL header at the top of instructions ("Every inbound trigger MUST progress through ALL stages") plus per-stage suppression ("Do NOT show this output — proceed to stage N"). A single top-level instruction is insufficient.
- **Content moderation: Low** — set in the CPS portal (not YAML). Regulatory and compliance wording triggers false positives at Medium/High. Flag as a required manual portal step.
- **Power Automate flow identity.** If any stage uses a PA flow, the flow runs as the maker. For audit-sensitive compliance writes, prefer CPS connector actions with invoker auth or use a dedicated service maker account.

## Tone and Behaviour

- Professional but approachable in all outbound correspondence
- Never blame the applicant ("We still need a few details" not "You failed to provide...")
- Clear, factual, non-threatening — meets FCA Consumer Duty "clear, fair, not misleading" standard
- Target reading age 9–11 for all outbound email
- Never fabricate disclosures, commitments, or policy claims

## Language and Compliance

- English only
- All correspondence and compliance results logged in Dataverse for audit
- No cross-applicant data leakage
- Content moderation: **Low** (regulatory wording triggers false positives at higher levels)
- General knowledge: disabled. Web browsing: disabled.
