# Copilot Studio Assessment Guide — Part 2: ALM, Governance & Security

How to manage agent lifecycle, protect data, and maintain control at scale.

---

## Application Lifecycle Management (ALM)

### Current State: Fundamentally Broken

ALM is the single biggest pain point for enterprise Copilot Studio deployments. The gap between what's promised and what works is significant.

**Managed solutions produce vague SQL errors.** When placing a Copilot Studio agent into a managed Power Platform solution, you will encounter unexplained SQL errors. These are typically caused by knowledge source references or connection references that don't transfer cleanly between environments.

**Deleting knowledge sources doesn't actually delete them.** When you remove a knowledge source from the UI, it's only removed from the visual interface. Checking via the API reveals it's still there. This creates ghost references that cause issues during solution import/export.

**No version diffing or rollback.** There is no way to see differences between versions of an agent, and no rollback capability. If a publish breaks something, your only option is to manually revert changes.

**Importing agents doesn't process knowledge sources.** ALM is not supported for any unstructured data knowledge source (SharePoint files/folders, OneDrive, Salesforce, Confluence, ServiceNow, ZenDesk). When you import an agent via solution, knowledge source processing does not happen automatically. You must manually re-add and re-process knowledge sources in the target environment.

### What You Should Do

- **Work inside Solutions from day one.** Even though ALM is painful, not using solutions is worse. It's the only mechanism for moving agents between dev/test/prod environments.
- **Maintain separate environments** for Development, Testing, and Production with separate consumption quotas and DLP policies.
- **Use deployment pipelines** via in-product pipelines or external DevOps platforms (Azure DevOps, GitHub). The in-product pipelines provide structured approvals but are still limited.
- **Document your agent configuration manually.** Because you can't diff versions, keep a changelog of instruction changes, knowledge source additions, topic modifications, and tool configurations outside of the platform.
- **Test knowledge sources after every import.** Never assume knowledge transferred correctly. Validate by querying the agent for content that should come from each knowledge source.

---

## Environment Strategy

**Environment isolation is essential.** Use distinct environments for Dev, Test, and Prod. Define DLP policies per environment. Each maker should ideally use their own Development environment (enable environment routing to enforce this).

**Environment routing:** Configure Power Platform to automatically route new makers to designated development environments rather than allowing them to create agents in default or production environments.

**Managed Environments:** Use Managed Environments in the Power Platform admin center for agent projects. This enables sharing controls, environment groups and rules, and additional governance features.

**Customer Managed Keys (CMK):** Environments with CMK enabled may restrict delegated credentials in generative orchestration — verify per-tenant before deploying agents that require end-user identity delegation.

**Data residency:** Copilot Studio stores data in the Dataverse environment's geo. Agents invoking Azure OpenAI Service may route model inference to a different region based on model availability and capacity. Confirm data-processing geography for each model tier (GPT-4.1 mini GA vs GPT-5 experimental) and document the resulting data-flow map for compliance review.

**Environment-per-team vs shared:** For enterprises with strict data isolation requirements, consider one environment per agent team. For shared environments, rely on Dataverse security roles and column-level security to segment data.

---

## Data Loss Prevention (DLP)

DLP enforcement became mandatory for all tenants in early 2025 — there are no more agent-level exemptions.

### What You Can Control with DLP Policies

**Authentication requirements:** Block the "Chat without Microsoft Entra ID authentication" connector to prevent makers from publishing agents that don't require sign-in. This ensures all agents require Entra ID auth.

**Knowledge source types:** Block specific knowledge source connectors:

- Knowledge source with SharePoint and OneDrive
- Knowledge source with public websites and data
- Use endpoint filtering for more granular control (allow/deny specific SharePoint URLs or public website domains)

**Connectors as tools:** Block specific Power Platform connectors to prevent them being used as agent tools.

**HTTP requests:** Block the HTTP connector to prevent agents from making arbitrary HTTP requests.

**Skills:** Block the "Skills with Copilot Studio" connector.

**Publishing channels:** Block specific channel connectors:

- Direct Line channels (demo website, custom websites, mobile app)
- Microsoft Teams
- Facebook, WhatsApp, Slack, etc.

If no channels are unblocked, agents simply can't be published.

**Event triggers:** Control whether makers can add event triggers that allow agents to react to external events without user prompting.

### DLP Classification Groups

In the Power Platform admin center, classify Copilot Studio connectors into data groups (Business, Non-Business, Blocked). Connectors in different groups can't be used together in the same agent.

---

## Purview DLP for M365 Copilot

Beyond Copilot Studio-level DLP, Microsoft Purview provides additional protection at the M365 Copilot layer:

**Prompt protection (preview):** Create DLP policies that block Copilot from responding when user prompts contain sensitive information types (SITs) — credit card numbers, passport IDs, SSNs, etc. This is real-time and applies to M365 Copilot, Copilot Chat, and prebuilt agents.

**Sensitivity label protection (GA):** Block Copilot from processing or summarising files and emails that have specific sensitivity labels. This prevents sensitive-labelled documents from appearing in Copilot responses.

**What this means for agents:** Agents published to M365 Copilot inherit these DLP controls. If a user's prompt contains blocked SITs, or if grounded content has blocked sensitivity labels, the agent will refuse to respond — but the error messaging may not clearly explain why (particularly in Word, Excel, PowerPoint).

---

## Authentication and Access Control

**Default authentication:** New agents default to "Authenticate with Microsoft" (Entra ID), which restricts them to Teams, SharePoint, Power Apps, or M365 Copilot channels.

**"No authentication" risk:** Makers can select "No authentication" to allow anyone with a link to chat. Use DLP to block this for production agents.

**Shared connections decision:** Decide whether agents will run actions in the user's context or via a dedicated service account (Copilot author account). This affects what data the agent can access and what actions it can perform on behalf of users.

**Service principals for SharePoint:** NOT supported. SharePoint grounding requires user authentication — you cannot use service principals for SharePoint knowledge source scenarios.

**Event-triggered agents:** Currently use only the maker's credentials for authentication. Tools called by an agent in response to a trigger must also use the maker's credentials. This is a significant limitation for production autonomous agents.

---

## Channel Constraints on Authentication

> The channel determines what auth is possible. A correctly configured OAuth connector still cannot delegate if the channel does not pass a user identity.

### Microsoft Teams

Full delegated end-user auth. User identity flows natively. Best channel for enterprise agents requiring user-scoped data. Entra SSO supported. Agent 365 Tooling Servers supported.

**Known channel limitations:** The Conversation Start topic is not supported in Teams. Group and meeting chats do not support manual authentication or Entra SSO — delegated identity only works in 1:1 bot conversations for those auth configurations. Certain media types and card formats are unsupported. Validate your exact conversation scope against current Teams channel limitations before committing to an auth model.

### Authenticated Web Chat

End-user auth supported when configured with Entra ID. Requires custom auth setup. Transcripts and Purview logging apply only to authenticated users.

### M365 Copilot (via Agent Builder)

Delegated auth on by default. Agent operates as the signed-in M365 user. Strong identity posture; Purview audit events cover agent publish, config changes, and interaction metadata for M365 Copilot workloads.

**Transcript caveat:** Dataverse ConversationTranscript records are **not** written for Microsoft 365 Copilot agents. Transcript audit evidence relies on M365 Purview and the M365 compliance portal, not the Copilot Studio Dataverse pipeline. This is a critical design difference for data retention, eDiscovery, and compliance design. Verify current logging paths and retention policies before treating M365 Copilot as the default "highest compliance" channel for transcript evidence.

### Anonymous Web Chat

No user identity. Delegated auth not possible. All connector calls run as maker/service account. Purview interaction logging not available. Do not use for user-scoped or sensitive data.

### Direct Line / Custom Apps

Auth depends on how the embedding app passes identity. Must explicitly pass Entra tokens. Validate end-to-end before production.

### Email / SMS Channels

No interactive identity session. All actions run as service account. No user delegation. Suitable for notification-type agents only.

### SharePoint Embedded

SharePoint user context can be passed, but requires careful auth configuration. Validate that the connector chain correctly inherits the user token end-to-end.

### Autonomous / Background Agents

No user session. Must use maker/service account for all actions. Hard platform constraint — no background delegated identity in Copilot Studio today.

---

## "Run As" Identity Decision

> The most important governance decision. Independent of Topic vs Agent — determined by connector capability AND channel. Both must be met for end-user delegation to work.

### Run As End User (Delegated)

- Actions respect the user's own permissions
- Natural audit trail — actions attributed to the individual
- Required for SharePoint, OneDrive, personal calendars, user-specific CRM records
- Requires both: (1) channel that passes identity AND (2) connector that supports OAuth delegation
- Supported in Topics and Agents, but only on authenticated channels (Teams, authenticated webchat, M365 Copilot)
- Hard constraint: Autonomous/background agents cannot use delegated identity — no interactive session exists
- CMK environments may restrict delegated credentials in generative orchestration — verify per tenant

### Run As Maker / Service Account

- Agent acts under the maker's or a service account's identity
- Required for autonomous agents — no user session exists (hard platform constraint)
- Use for scheduled flows, background processing, system-to-system integrations
- Governance risk: Over-permissioned service account can act across all users' data
- Apply least privilege, secrets rotation, audit monitoring via Sentinel
- Users may see "runs under author's identity" warning in some channels

### Mixed / Per-Connection

- Each connection inside a Power Automate flow can independently run as user or as flow owner
- A single flow can mix delegated and service-account actions in the same execution
- MCP via OAuth auth-code flow: end-user delegation supported if server configured correctly
- MCP via API key: service-level only, no per-user identity
- Agent 365 Tooling Servers: act on behalf of the signed-in user when deployed on Teams/M365 Copilot

---

## Connector Authentication Support Matrix

> Assumes an authenticated channel (Teams or authenticated webchat). On anonymous channels, end-user delegation is not possible regardless of connector capability.

| Connector / System                         | Supports End User (Delegated)?                             | Supports Service Account?                 | Auth Type                                   | Enterprise Notes                                                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SharePoint**                             | Yes                                                        | Yes                                       | OAuth 2.0 / Entra ID                        | End-user preferred; SharePoint permissions model enforced natively. Service account needs explicit site/library permissions.                                                                       |
| **Microsoft Teams**                        | Yes                                                        | Yes                                       | OAuth 2.0 / Entra ID                        | Posting as user vs. posting as bot are distinct; delegated auth gives human attribution in chat history.                                                                                           |
| **Outlook / Exchange**                     | Yes                                                        | Yes (shared mailbox)                      | OAuth 2.0 / Entra ID                        | End user = sends from their own mailbox. Service account = shared/service mailbox. Can't send from another user's mailbox without explicit delegation grant in Exchange.                           |
| **Dataverse**                              | Yes                                                        | Yes                                       | OAuth 2.0 / Entra ID                        | Row-level security applies when running as end user; strongly preferred for data governance. Service account bypasses record-sharing rules.                                                        |
| **Dynamics 365**                           | Yes                                                        | Yes                                       | OAuth 2.0 / Entra ID                        | D365 security roles apply for delegated users. Service account must have explicit CRM roles; avoid System Administrator unless absolutely required.                                                |
| **OneDrive for Business**                  | Yes                                                        | Limited: own drive only                   | OAuth 2.0 / Entra ID                        | Service account can only access its own OneDrive. Accessing other users' files requires admin-granted delegated permissions.                                                                       |
| **SQL Server (On-Premises)**               | No: gateway does not support true end-user delegation      | Yes                                       | SQL auth / Windows auth via On-Prem Gateway | Even if a username is passed, it is not delegated identity; the gateway does not propagate end-user Entra tokens. Compensate with row-level security at the database level.                        |
| **Azure SQL**                              | Possible with Entra ID; rarely implemented correctly       | Yes                                       | SQL auth or Entra ID                        | Delegation via Entra is technically possible but requires both the connector and Azure SQL to be configured for Entra auth — non-trivial. Most deployments use service identity.                   |
| **SAP ERP / SAP OData**                    | No                                                         | Yes                                       | Basic auth / SAP OAuth                      | The standard Power Platform SAP connector doesn't support end-user OAuth delegation. Always runs as a configured SAP technical user. User attribution must be managed within SAP's own audit logs. |
| **ServiceNow**                             | Possible via OAuth; requires explicit impersonation config | Yes                                       | Basic auth or OAuth 2.0                     | ServiceNow's "impersonate user" capability must be explicitly enabled and audited. Many organisations default to service account due to configuration complexity.                                  |
| **Salesforce**                             | Yes: via OAuth                                             | Yes                                       | OAuth 2.0                                   | Salesforce sharing model and record-level security apply for delegated users. Service account bypasses record-level sharing; significant governance risk for write operations.                     |
| **Custom Connector (REST API)**            | Yes: if API supports OAuth 2.0                             | Yes                                       | OAuth 2.0, API Key, or Basic                | If backend supports Entra ID tokens, delegated auth is achievable. API key = service-level only. Best practice: design internal APIs to accept and validate Entra tokens.                          |
| **MCP Server (OAuth 2.0 auth code)**       | Yes: if server validates user tokens                       | Yes: via client credentials               | OAuth 2.0                                   | End-user delegation requires the MCP server to implement and validate OAuth auth-code flow — not just accept a token. Validate server implementation before assuming delegation works.             |
| **MCP Server (API Key only)**              | No: shared secret, no per-user identity                    | Yes                                       | API Key                                     | API key is a shared secret; there is no per-user identity concept. Always service-level.                                                                                                           |
| **Agent 365 Tooling Servers**              | Yes — acts as signed-in user on Teams / M365 Copilot       | Not applicable — user-delegated by design | Entra ID (M365 Copilot license)             | Designed for delegated identity. Requires M365 Copilot licensing and current program eligibility; verify prerequisites before design.                                                              |
| **HTTP Action (direct, no connector)**     | No — zero user context                                     | API key / static token only               | API Key / Static token                      | No auth context gets passed. Don't use for user-scoped or sensitive data in production.                                                                                                            |
| **Power Automate Cloud Flow (from Topic)** | Yes                                                        | Yes                                       | Entra ID (per connection)                   | Each connection in the flow can independently run as end user or flow owner. Topic guarantees the flow fires at the right point; individual connections enforce the right identity.                |

---

## Auth Identity Decision Tree

### Does the action need to be attributed to a specific user for compliance, data security, or audit?

**YES — actions must carry user identity** (SharePoint edits, CRM updates, sending mail):

> Is the channel authenticated (Teams, M365 Copilot, authenticated webchat)? Does the connector support OAuth delegation? If **both yes**: Topic + Connector (end user) for deterministic flows, or Agent with user auth for variable tasks. If **either no**: Delegation not possible — redesign the channel choice or compensate at the system level.

**YES — but the system does not support delegation** (SAP, on-prem SQL, legacy systems):

> Topic + Connector (service account). Compensate with row-level security at the source system, system-level audit logging, least-privilege service account, and formal risk acceptance documentation.

**NO — background or autonomous process; no user session:**

> Service account required. Hard platform constraint. No user session means no delegation in Copilot Studio today. Use Agent Flows with maker credentials. Apply strict least privilege. Monitor via Sentinel. Consider HITL approval checkpoints for high-risk actions (now in preview).

**NO — user identity not required:**

> Either approach works. Simple/scripted = Topic + Connector. Complex/variable = Agent + Tool. Pure Q&A = Knowledge Source.

---

## Oversharing and Data Exposure

Copilot (and by extension Copilot Studio agents) can only return content that the user has permission to access. But "permission to access" is often broader than intended due to historic oversharing in SharePoint and OneDrive.

### Proactive Steps

- **Run Data Access Governance reports** in SharePoint to identify overshared sites
- **Deploy sensitivity labels** and configure auto-labelling where possible
- **Use Restricted SharePoint Search (RSS)** as a temporary control — add only reviewed/approved sites to the allowed list. RSS is temporary; the long-term fix is correcting permissions.
- **Use SharePoint Advanced Management** features: Content Management Assessment, Restricted Access Control (RAC), Restricted Content Discovery (RCD)
- **Review and remediate overshared links at scale** using Purview DSPM for AI data risk assessments (item-level investigation and remediation)

### Encryption Interaction

For Copilot to interact with encrypted content, the user must have EXTRACT and VIEW usage rights. Items encrypted by Azure Rights Management (even without a sensitivity label) still require these rights. If the user doesn't have them, Copilot silently skips the content — no error, just no results from that source.

---

## Sharing and Collaboration Controls

**Sharing rules** are configured as Managed Environments controls in the Power Platform admin center.

**Editor permissions** can only be granted to individual users — you cannot grant Editor permissions to security groups.

**Viewer permissions** (chat-only access) can be assigned to individuals.

**Sharing rule enforcement:** Rules are enforced when users try to share. Existing shares aren't affected retroactively, but out-of-compliance shares can only be reduced (not expanded) until the agent complies with current rules.

---

## Monitoring and Auditing

**Copilot Studio Analytics:** Built-in analytics for conversation insights, topic performance, and credit consumption. Available in the Power Platform admin center under Licensing > Copilot Studio.

**Per-agent consumption caps:** You can set monthly consumption limits for individual agents in the Power Platform admin center (Licensing > Copilot Studio > Manage Agents).

**Purview integration:**

- eDiscovery: Search and export Copilot prompts, responses, and referenced files
- Audit records: Copilot prompts, responses, and referenced content are logged
- Retention policies: Interaction data follows configured Purview retention policies
- Insider Risk Management: Alerts on anomalous user behaviour patterns

**Conversation transcripts:** Stored in the Dataverse Conversation Transcripts table with a default retention period of 30 days. For longer retention, export to external storage or Power BI. **Important:** Dataverse transcripts are **not** written for Microsoft 365 Copilot agents — M365 Copilot uses separate M365 logging paths. Verify transcript architecture per deployment channel before committing to a retention design.

**Admin transcript controls:** Tenant admins can disable transcript saving per environment via the Power Platform Admin Center. Environment group rules override individual environment settings. Allow approximately 24 hours for a disable setting to take effect; transcripts may continue saving during this lag window.

**Power Platform audit logs:** Enable maker audit logs in Purview and Sentinel for monitoring agent creation, modification, and publishing events.

---

## Security Guardrails

### Prompt Injection & Input Validation

- Agents can be manipulated through malicious inputs from users, documents, or tool responses ("indirect prompt injection")
- Topics are significantly more resistant — scripted flow, not subject to AI reasoning manipulation
- Mitigations: scope agent instructions tightly; validate tool inputs; Purview DLP blocks sensitive data in prompts
- Cloud Adoption Framework mandates dedicated AI red teaming and prompt injection testing for production agents

### External Threat Detection (Public Preview)

Third-party runtime guardrails (e.g. Noma Security) can be invoked when the orchestrator considers tool calls. Generative orchestration required.

**Fail-open timeout warning:** The external provider must respond within approximately 1 second. If no decision is returned within the timeout window, runtime behaviour defaults to allow (configurable to block). In latency-sensitive or high-security deployments, verify your provider's p99 response time and configure the error behaviour explicitly. A misconfigured or slow provider silently passes all tool calls through.

### Human-in-the-Loop (HITL) Approval Checkpoints

HITL (preview since Nov 2025) allows agents to pause and request human approval before proceeding. Use for financial authorisation, procurement, data deletion, or any irreversible action. Governance bridge between full autonomy and full determinism.

### Grounding Scope Control

- Decide whether to enable web grounding or restrict to enterprise-only sources. Web grounding increases answer breadth but introduces disclosure risk.
- Enterprise-only grounding: restrict agents to approved Knowledge Sources. Disable web search where policy requires it.
- Agents grounded on internal documents can still "helpfully" disclose sensitive information if the Knowledge Source scope is too broad. Scope tightly.
- MIP sensitivity labels (Preview) control which content the agent can surface, enforced across connectors and test chat.
- Even when Dataverse is added as a Knowledge Source, content is accessed via semantic indexing — not a live transactional query. For real-time or per-user Dataverse data, use a Connector.
- Treat any write, delete, or financial action as consequential — require confirmation or HITL approval before execution.

### Tool Access Scoping

- Do not trust the model to decide access — restrict agents to only the tools and knowledge they need
- An over-tooled agent is a security risk: wider tool surface = wider blast radius for prompt injection
- For MCP servers: use allow/deny controls to prevent unintended tool exposure; do not use "allow all" in production
- Cap production agents at 25–30 active tools. Hard platform limit is 128; performance degrades before that.

---

## Content Filtering

Copilot Studio includes built-in responsible AI content filtering. Key issue: **when an agent response is ContentFiltered, there is zero transparency about what triggered it.** No logging, no reason code, no detail explaining why a particular input, output, or tool execution was blocked. Debugging content filter blocks is currently impossible without filing a support ticket.

---

## Governance Gaps (As of March 2026)

These are things you'd expect to be able to do but currently can't:

- **Cannot prevent users from creating agents in non-default environments** (only redirect via environment routing, not enforce)
- **Cannot block users from deploying agents to M365 Copilot** without direct admin involvement
- **Cannot default-block newly created custom agents** in the Microsoft Admin Centre
- **Limited visibility** into which agents are being used and by whom (analytics are improving but still basic)
- **No centralised agent inventory** that gives admins a single view of all agents across all environments with their status, usage, and compliance posture
