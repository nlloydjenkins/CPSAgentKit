# IT Help Desk — Systems & Integration Context

## Current IT Landscape

### Microsoft 365 Tenant

- **Tenant:** contoso.onmicrosoft.com
- **Entra ID:** All 1,200 employees have Entra ID accounts with MFA enabled
- **Licensing:** Microsoft 365 E3 for all staff; 10 IT analysts have E5. No M365 Copilot licences currently.
- **Teams:** Primary collaboration tool; all employees use it daily. There is an existing **IT Support** Teams channel (Team: IT Department, Channel: Support Requests) used by the 6 analysts.

### SharePoint — IT Knowledge Base

- **Site:** https://contoso.sharepoint.com/sites/ITKnowledgeBase
- **Content:** ~80 articles covering VPN, Wi-Fi, printers, MFA, password resets, software installation, approved devices, office-specific setup guides
- **Format:** Modern SharePoint pages (no classic ASPX). Each article is a separate page with clear headings.
- **Size:** Individual articles range from 500 bytes to 3 MB. No files exceed 7 MB.
- **Update frequency:** IT team updates articles monthly. Sync delay of 4–6 hours is acceptable.
- **Sensitivity labels:** None applied to the IT knowledge base. All content is Internal.

**For demo/testing:** 7 sample knowledge articles are provided in `sample-data/knowledge-articles/`. These can be uploaded as file-based knowledge sources in Copilot Studio instead of connecting a live SharePoint site. Topics covered: VPN setup, Wi-Fi by office, MFA setup, printers, software installation, password reset, and approved devices/BYOD.

### Dataverse Environment

- **Environment:** Contoso IT Dev (managed environment)
- **Publisher prefix:** cr85a\_
- **Existing tables:** None specific to IT support (greenfield). The agent will need new tables for tickets.
- **MCP Server:** The Dataverse MCP Server is enabled on this environment. The Copilot Studio MCP client is registered in the allowed clients list.

**For demo/testing:** 5 sample IT support tickets are provided in `sample-data/dataverse-seed-data.md`. These should be inserted after the table is created during the Build phase. They cover a mix of Open, In Progress, Resolved, and Closed tickets so the "check ticket status" flow works immediately.

### Proposed Dataverse Table: IT Support Tickets

| Column                | Type        | Required | Notes                               |
| --------------------- | ----------- | -------- | ----------------------------------- |
| cr85a_ticket_id       | Auto-number | Yes      | Format: INC-{SEQNUM:5}              |
| cr85a_employee_name   | Text (100)  | Yes      | From authenticated user             |
| cr85a_employee_email  | Text (200)  | Yes      | From authenticated user             |
| cr85a_issue_summary   | Text (2000) | Yes      | Free text from employee             |
| cr85a_priority        | Choice      | Yes      | Low, Medium, High, Critical         |
| cr85a_office_location | Choice      | Yes      | London, Manchester, Edinburgh       |
| cr85a_device_type     | Choice      | No       | Laptop, Desktop, Mobile, Other      |
| cr85a_status          | Choice      | Yes      | Open, In Progress, Resolved, Closed |
| cr85a_manager_email   | Text (200)  | No       | Populated for High/Critical tickets |
| cr85a_created_on      | DateTime    | Yes      | Auto-populated                      |

### Choice Field Integer Mappings

The Dataverse MCP Server requires integer values for choice columns — passing text labels like "High" causes a FormatException. Agent instructions and seed data must use these integer values:

**cr85a_priority:** Low = 100000000, Medium = 100000001, High = 100000002, Critical = 100000003

**cr85a_office_location:** London = 100000000, Manchester = 100000001, Edinburgh = 100000002

**cr85a_device_type:** Laptop = 100000000, Desktop = 100000001, Mobile = 100000002, Other = 100000003

**cr85a_status:** Open = 100000000, In Progress = 100000001, Resolved = 100000002, Closed = 100000003

### Email — Notification

- **Shared mailbox:** itsupport@contoso.com
- High and Critical priority tickets should trigger an email to itsupport@contoso.com with ticket details.

### Teams — Notification

- **Team:** IT Department
- **Channel:** Support Requests
- High and Critical priority tickets should also post a message to this channel with ticket details so the on-call analyst sees it immediately.

## Integration Points

### Tools and Connectors (per agent)

**Parent — IT Help Desk Orchestrator:**

1. **Dataverse MCP Server** — All Dataverse operations (create ticket, read ticket status, update ticket, delete ticket) go through the Dataverse MCP Server tool. This is the ONLY path to Dataverse; do not use the standard Dataverse connector. MCP tools must live on the parent agent because child-owned MCP tools are not invoked reliably through parent orchestration.
2. **Office 365 Users connector** — "Get my profile (V2)" action to look up the authenticated user's profile (name, email, manager). Use "Get my profile" (not "Get user profile") — it returns the logged-in user automatically with no UPN input required.

**Child — Knowledge Specialist:**

- **SharePoint knowledge source** — IT Knowledge Base site. No tools; this agent only answers questions from knowledge.

**Child — Notification Specialist:**

1. **Microsoft Teams connector** — Post a message to the IT Support channel when a High/Critical ticket is created.
2. **Office 365 Outlook connector** — Send an email notification to itsupport@contoso.com for High/Critical tickets.

### Authentication

- **Agent auth:** Authenticate with Microsoft (Entra ID) — all employees have accounts
- **Channel:** Microsoft Teams only
- **Connector auth:** Office 365 Users, Teams, and Outlook connectors use invoker (end-user) authentication. Dataverse MCP uses the authenticated user's identity.

## Constraints Specific to This Deployment

- No M365 Copilot licences → SharePoint knowledge files must stay under 7 MB each
- Dataverse MCP Server is the only data path to Dataverse — no standard Dataverse connector
- MCP tool must be owned by the parent orchestrator (CPS platform constraint: child-agent MCP calls don't execute through parent orchestration)
- Single managed Dataverse environment for dev and initial testing
- IT team wants to manage the knowledge base in SharePoint (not as uploaded files) so that existing editorial workflows continue
- The agent should NOT use general knowledge / web browsing — all answers must come from the SharePoint knowledge base or Dataverse
- Teams and Outlook connectors on the Notification Specialist child agent are standard connectors (not MCP) so they will work through parent orchestration
