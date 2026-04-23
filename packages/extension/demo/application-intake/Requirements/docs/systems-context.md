# Application Intake Agent — Systems & Integration Context

## Current Landscape

### Microsoft 365 Tenant

- **Tenant:** contoso.onmicrosoft.com
- **Entra ID:** All operations staff have Entra ID accounts with MFA enabled.
- **Licensing:** Microsoft 365 E3 for all staff. No M365 Copilot licences currently.
- **Teams:** Primary collaboration tool. There is an existing **Applications Team** with an **Escalations** channel used by the 8 analysts for case reviews.

### Shared Mailbox

- **Address:** applications@contoso.com
- **Purpose:** All inbound applications arrive here. Outbound acknowledgements, information requests, and chase emails are sent from this address.
- **Send As permission:** The service account / maker identity used by the agent must have Send As permission on this mailbox.

### Dataverse Environment

- **Environment:** Contoso Applications Dev (managed environment)
- **Publisher prefix:** cr85a\_
- **Existing tables:** None specific to application intake (greenfield). The agent will need new tables.

### Proposed Dataverse Tables

#### cr85a_applications

| Column                   | Type         | Required | Notes                                                      |
| ------------------------ | ------------ | -------- | ---------------------------------------------------------- |
| cr85a_applicationid      | GUID (PK)    | Yes      | Auto-generated                                             |
| cr85a_name               | Text (100)   | Yes      | Reference number (primary name column, e.g. APP-2026-0001) |
| cr85a_reference_number   | Auto-number  | Yes      | Format: APP-{SEQNUM:4}                                     |
| cr85a_applicant_name     | Text (200)   | Yes      | From email interpretation                                  |
| cr85a_applicant_email    | Text (200)   | Yes      | From email sender                                          |
| cr85a_account_number     | Text (50)    | No       | If the application relates to an existing account          |
| cr85a_application_type   | Choice       | Yes      | See integer mappings below                                 |
| cr85a_status             | Choice       | Yes      | See integer mappings below                                 |
| cr85a_assigned_queue     | Text (100)   | No       | Routing destination based on application type              |
| cr85a_escalation_reason  | Text (500)   | No       | Populated when status = Escalated                          |
| cr85a_overall_confidence | Decimal      | No       | Email Interpreter's aggregate confidence                   |
| cr85a_chase_count        | Whole Number | No       | Number of chase emails sent                                |
| cr85a_next_chase_date    | Date Only    | No       | When the next chase should fire                            |
| cr85a_dob                | Text (20)    | No       | Applicant date of birth                                    |
| cr85a_contact_number     | Text (20)    | No       | Applicant phone number                                     |
| cr85a_address            | Text (500)   | No       | Applicant address                                          |
| cr85a_outlook_message_id | Text (500)   | No       | For thread matching                                        |

#### cr85a_correspondences

| Column                   | Type        | Required | Notes                                          |
| ------------------------ | ----------- | -------- | ---------------------------------------------- |
| cr85a_correspondenceid   | GUID (PK)   | Yes      | Auto-generated                                 |
| cr85a_name               | Text (200)  | Yes      | Primary name (email subject or auto-generated) |
| cr85a_application        | Lookup      | Yes      | FK to cr85a_applications                       |
| cr85a_direction          | Choice      | Yes      | See integer mappings below                     |
| cr85a_email_subject      | Text (500)  | No       | Email subject line                             |
| cr85a_email_body_preview | Text (4000) | No       | First 4000 chars of email body                 |
| cr85a_outlook_message_id | Text (500)  | No       | Outlook message ID for thread tracking         |
| cr85a_type               | Choice      | Yes      | See integer mappings below                     |

#### cr85a_compliancechecks

| Column                     | Type         | Required | Notes                               |
| -------------------------- | ------------ | -------- | ----------------------------------- |
| cr85a_compliancecheckid    | GUID (PK)    | Yes      | Auto-generated                      |
| cr85a_name                 | Text (200)   | Yes      | Primary name (rule name + attempt)  |
| cr85a_correspondence       | Lookup       | Yes      | FK to cr85a_correspondences         |
| cr85a_rule_name            | Text (200)   | Yes      | Which compliance rule was checked   |
| cr85a_verdict              | Choice       | Yes      | See integer mappings below          |
| cr85a_revision_instruction | Text (2000)  | No       | Populated on failure                |
| cr85a_attempt_number       | Whole Number | Yes      | Which revision attempt (1, 2, etc.) |

### Choice Field Integer Mappings

All choice columns require integer values. Text labels cause `FormatException` errors.

**cr85a_application_type:**

| Label             | Integer   |
| ----------------- | --------- |
| Account Amendment | 100000000 |
| New Application   | 100000001 |
| Cancellation      | 100000002 |
| Enquiry           | 100000003 |
| Unknown           | 100000004 |

**cr85a_status (applications):**

| Label                | Integer   |
| -------------------- | --------- |
| New                  | 100000000 |
| Awaiting Applicant   | 100000001 |
| Ready for Processing | 100000002 |
| Escalated            | 100000003 |
| Approved             | 100000004 |
| Rejected             | 100000005 |
| Closed – No Response | 100000006 |

**cr85a_direction (correspondences):**

| Label    | Integer   |
| -------- | --------- |
| Inbound  | 100000000 |
| Outbound | 100000001 |

**cr85a_type (correspondences):**

| Label               | Integer   |
| ------------------- | --------- |
| Initial Application | 100000000 |
| Information Request | 100000001 |
| Acknowledgement     | 100000002 |
| Chase               | 100000003 |
| Reply               | 100000004 |
| Escalation          | 100000005 |

**cr85a_verdict (compliance checks):**

| Label          | Integer   |
| -------------- | --------- |
| Pass           | 100000000 |
| Fail           | 100000001 |
| Not Applicable | 100000002 |

## Integration Points

### Tools and Connectors (All on Parent Agent)

All tools must live on the parent agent. Child agents cannot own autonomous triggers and child-owned MCP/connector tools are unreliable through parent orchestration.

1. **Microsoft Dataverse — List rows** — Read existing applications, correspondences, and compliance checks for thread matching, contradiction detection, and chase scheduling.
2. **Microsoft Dataverse — Add a new row** — Create application, correspondence, and compliance check records. Because the generic "Add a new row" connector binds to the first table's schema per conversation, create **separate pre-bound actions** per table to avoid `UnresolvedDynamicType` errors.
3. **Microsoft Dataverse — Update a row** — Update application status, chase dates, queue assignment, escalation reasons.
4. **Office 365 Outlook — Get email (V3)** — Retrieve full inbound message content and thread context.
5. **Office 365 Outlook — Send an email from a shared mailbox (V2)** — Send approved outbound emails from `applications@contoso.com`. Only after compliance + accessibility approval.
6. **Microsoft Teams — Post adaptive card and wait for a response** — Escalate cases to the Escalations channel and capture the human decision.
7. **Attachment Preprocessor** — Prompt tool with code interpreter to convert PDF/DOCX attachments to text/Markdown.

### Authentication

- **Agent auth:** Authenticate with Microsoft (Entra ID)
- **Channel:** Not user-facing in Teams — this is an autonomous agent triggered by mailbox events. Operations staff interact via the Teams escalation channel and the model-driven Power App.
- **Connector auth:** Outlook and Teams connectors use maker credentials (autonomous agent constraint). Dataverse connectors use invoker auth where possible.

### Teams Channel Setup

- **Team:** Applications Team
- **Channel:** Escalations
- **Purpose:** Receives adaptive cards for human review of ambiguous, contradictory, or compliance-failed cases.

## Constraints Specific to This Deployment

- No M365 Copilot licence — SharePoint knowledge files must stay under 7 MB each.
- Managed environment required for Dataverse.
- Content moderation must be set to Low (portal-only setting) — the domain includes compliance and regulatory wording.
- General knowledge and web browsing must be disabled — this is a compliance-sensitive workflow.
- The autonomous trigger runs as the maker identity — all connector actions in trigger-driven runs use maker credentials.
- Cloud flow 100-second timeout applies if Power Automate flows are added later.
