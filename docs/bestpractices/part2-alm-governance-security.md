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

**Conversation transcripts:** Stored in the Dataverse Conversation Transcripts table with a default retention period of 30 days. For longer retention, export to external storage or Power BI.

**Power Platform audit logs:** Enable maker audit logs in Purview and Sentinel for monitoring agent creation, modification, and publishing events.

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
