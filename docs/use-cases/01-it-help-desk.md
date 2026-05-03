# Use Case 1 — IT Help Desk Agent

## Background

Contoso Ltd (1,200 employees across London, Manchester, and Edinburgh) is replacing its email-based IT support with a multi-agent Copilot Studio solution published to Microsoft Teams. The existing shared mailbox (`itsupport@contoso.com`) is triaged by two analysts. Average first-response time is 4 hours; the target is under 5 minutes for common issues.

The solution uses a parent orchestrator coordinating specialist child agents so each domain (knowledge lookup, ticket management, notifications) is owned by a dedicated agent.

## Build-Time Configuration

The named Contoso values are defaults for the sample scenario. During Build, CPSAgentKit must ask the maker to confirm or replace the tenant-specific values before finalising tenant-bound portal steps, tool descriptions, prompt text, or topics. Missing values should block only the specific tenant-bound action that needs them; Build should still perform safe work that does not depend on those values:

- Organisation name and office/location choices
- IT shared mailbox, default `itsupport@contoso.com`
- IT Support Teams team/channel used for notifications
- SharePoint site/library for approved IT knowledge articles
- Dataverse publisher prefix/table names if the environment does not use `cr85a_`
- Audit retention requirement and Teams publishing target

## Primary Users and Channel

- **All Contoso employees** via Microsoft Teams (desktop and mobile)
- **IT Support Team** (6 analysts) who resolve escalated tickets
- Authenticated via Microsoft Entra ID — no anonymous access

## What the Solution Should Do

1. **Answer common IT questions** from an approved knowledge base (company IT wiki on SharePoint). Examples: "How do I connect to VPN?", "Wi-Fi password for the Manchester office?", "How do I set up MFA?" — owned by a **Knowledge Specialist** child agent.
2. **Create support tickets** in Dataverse when the agent cannot resolve the issue from knowledge alone. Capture: employee name, email, issue summary, priority (Low / Medium / High / Critical), office location, device type. Dataverse access uses the **Dataverse MCP Server** (not the standard connector).
3. **Check ticket status** — "What's the status of my ticket?" reads live state from Dataverse via MCP.
4. **Look up the user's profile** — the parent identifies the authenticated user.
5. **Notify the IT team** for High and Critical tickets — owned by a **Notification Specialist** child agent:
   - Post a message in the **IT Support** Teams channel with ticket details
   - Send an email to `itsupport@contoso.com` via Outlook
6. **Update a ticket** — users update their own tickets by ticket name. Agent matches `cr85a_name` + user email. If ambiguous, list tickets and ask to clarify. Updatable: summary, priority, status, device, location.
7. **Delete a ticket** — users delete their own tickets with explicit confirmation. Users cannot delete other people's tickets.
8. **Escalate to a human** when the user asks or when priority is Critical (security incident, data breach suspicion, complete outage).

## What the Solution Should NOT Do

- Reset passwords or modify Active Directory accounts
- Access HR, Finance, or CRM systems
- Answer non-IT topics (HR policies, expenses, facilities)
- Share internal infrastructure details (server names, IP ranges, credentials)
- Create, update, or delete tickets for other employees
- Use general knowledge or web browsing — all answers come from SharePoint or Dataverse

## Success Criteria

- 70% of common IT questions resolved from the knowledge base without creating a ticket
- Ticket created in Dataverse within 30 seconds of user confirming details
- High/Critical tickets produce both Teams channel post and email within 15 seconds
- Escalation to human analyst includes full context (original question, attempted answer, ticket ID)
- Employee satisfaction 4+ out of 5 in post-interaction survey

## Systems and Tools

- **Authentication:** Microsoft Entra ID (user authentication)
- **Knowledge:** SharePoint site — `IT Wiki` document library (indexed by CPS)
- **Ticket store:** Dataverse — custom `cr85a_ticket` table via **Dataverse MCP Server**
- **Notifications:** Microsoft Teams channel post (connector) + Office 365 Outlook send email (connector)
- **Channel:** Microsoft Teams (agent published to Teams)

## Platform Considerations

- **MCP must live on the parent.** Child agents cannot invoke MCP tools when called via parent orchestration (child fires, MCP calls don't execute). The Dataverse MCP Server tools belong on the parent orchestrator; the Knowledge Specialist child only owns the SharePoint knowledge source.
- **Integer values for Dataverse choice columns.** The Priority column (`cr85a_priority`) must be passed as the integer mapping (e.g. Low=100000000, Medium=100000001, High=100000002, Critical=100000003) in both the Dataverse MCP Server tool description and agent instructions — text labels cause `FormatException`. Verify the exact integer mapping against the live schema after table creation.
- **Use "Get my profile (V2)"** not "Get user profile (V2)" for current-user lookup (the latter requires a UPN input and causes unwanted user prompting).
- **Content moderation** set in the CPS portal (not YAML) — flag as a required manual portal step.

## Tone and Behaviour

- Professional but approachable — not robotic
- Use the employee's first name when available
- If uncertain: "I don't have that information — let me create a ticket for the IT team" (never guess)
- Never fabricate a solution; always ground in knowledge or escalate

## Language and Compliance

- English only
- All interactions logged for audit (minimum 90-day retention)
- Personal data limited to what's needed for the ticket (name, email, location, device type)
- Content moderation: Medium
- General knowledge: disabled. Web browsing: disabled.

## Sample Interactions

**1. Knowledge lookup**

> User: How do I connect to the London office Wi-Fi?
> Agent: [pulls from SharePoint wiki] "For the London office, connect to `Contoso-Staff` and authenticate with your Entra ID credentials. MFA will prompt on your phone."

**2. Ticket creation (High priority)**

> User: My laptop screen is flickering badly and I can't work.
> Agent: "That sounds blocking — I'll raise a High priority ticket. Can you confirm your office and laptop model?"
> User: London, Dell Latitude 7420.
> Agent: [creates Dataverse record, posts to IT Support Teams channel, emails itsupport@] "Ticket `Laptop Screen Flickering` created. The IT team has been notified and will respond within 30 minutes."

**3. Out-of-scope**

> User: What's my annual leave balance?
> Agent: "That's an HR question — I only handle IT support. Please check Contoso HR Portal or contact HR."

## Validated Build Findings — 2026-05-03

The `ITHelpDesk3` live build confirmed that CPSAgentKit can create or repair some Copilot Studio assets from VS Code when it follows portal-exported shapes, but local validation is only the first gate. Product automation must keep Apply Changes, portal inspection, Get Changes, runtime discovery, and Activity Map execution as separate validation states.

### Confirmed Working Paths

- Child-agent shells can be manually scaffolded with `kind: AgentDialog`, `beginDialog.kind: OnToolSelected`, strong `beginDialog.description`, and `settings.instructions`. Use filesystem-safe folder names such as `agents/KnowledgeSpecialist/`, while keeping friendly names like `Knowledge Specialist` in `mcs.metadata.componentName`. Child-owned tools and knowledge should also be created by Build when verified export/API patterns and tenant-specific connection values are available.
- Deterministic parent topics can be scaffolded for create, status, update, delete, and escalation workflows when they handle routing, questions, confirmation, safety checks, and messages.
- Uploaded-file knowledge can be created programmatically only through the Copilot Studio/Dataverse backend: create `botcomponent` with `componenttype = 14`, bind `parentbotid@odata.bind`, bind child-owned records with case-sensitive `ParentBotComponentId@odata.bind`, upload raw bytes to `filedata`, wait for Ready, run Get Changes, and validate retrieval in Activity Map.
- Dataverse MCP schema work can be performed during Build when the MCP server is configured and tenant auth is aligned. The live table was `cr85a_ticket`; choice integer mappings must be verified from the live schema.
- The full `ITHelpDesk3` run proved that connector actions, direct uploaded-file knowledge, Teams publishing configuration, and MCP attachment can be added from VS Code when CPSAgentKit has tenant-specific connection values plus a known-good export/API pattern. These artifacts still need the manual acceptance gate: Apply Changes / portal inspection / Get Changes / Activity Map validation, but the maker should not have to recreate every connector, knowledge source, publishing setting, or MCP attachment by hand.
- For IT Help Desk builds, these are required Build Agent actions when tenant values and reference/API patterns are available: create `Knowledge Specialist`, create `Notification Specialist`, attach `Microsoft Dataverse MCP Server` to the parent, add Office 365 Users `Get my profile (V2)` to the parent, add Teams `Post message in a chat or channel` to `Notification Specialist`, add Outlook `Send an email from a shared mailbox (V2)` to `Notification Specialist`, create all declared parent topics, and attach the approved IT knowledge source through a verified backend/API path. Build must attempt these first and checklist only missing tenant values, missing connection/auth context, missing verified patterns, or the acceptance/validation gate.
- Build must search for validated reference artifacts before declaring those tools blocked. Check sibling/reference folders and notes such as `Reference/`, prior workspace folders, `Requirements/*tool*yaml*findings*.md`, `Requirements/*product*notes*.md`, `Requirements/*implementation*sketch*.md`, root `connectionreferences.mcs.yml`, exported `actions/*.mcs.yml`, and child `agents/*/actions/*.mcs.yml`.
- The reusable IT Help Desk tool scaffold uses root `connectionreferences.mcs.yml`, parent actions `MicrosoftDataverse-MicrosoftDataverseMCPServer.mcs.yml` and `Office365Users-GetmyprofileV2.mcs.yml`, and child actions `MicrosoftTeams-Postmessageinachatorchannel.mcs.yml` and `Office365Outlook-SendanemailV2.mcs.yml`. Preserve verified operation IDs `InvokeMCP`, `MyProfile_V2`, `PostMessageToConversation`, and `SendEmailV2`, while parameterizing folder names, connection reference logical names, Dataverse table/choice mappings, Teams/shared mailbox wording, and exact `modelDisplayName` values.

### Product Boundaries

- Child agents, child-owned tools, child-owned knowledge, custom auth, prompt tools, flows, or portal-only settings must be created by Build when a verified export/API path exists for that specific child-owned artifact. Portal-first is only the fallback when no verified path exists.
- Manual action YAML scaffolding is no longer just theoretical for this use case, but it remains reference-backed and provisional. It must be template-driven from known-good exports with root `connectionreferences.mcs.yml`, export-shaped `TaskDialog` files, exact `modelDisplayName`, inline `modelDescription`, matching `action.connectionReference`, and operation IDs such as `InvokeMCP`, `MyProfile_V2`, `PostMessageToConversation`, or `SendEmailV2` only when verified by export/reference.
- If a verified scaffold is used, the checklist should say `Apply Changes and inspect the scaffolded tools`, then `Get Changes`, MCP discovery validation, and Activity Map testing. It should not say to create those tools manually.
- Tool names in slash references must match exported `modelDisplayName` values exactly. The tested Dataverse tool name was `/Microsoft Dataverse MCP Server`, not `/Microsoft Dataverse MCP Server (Preview)`.
- MCP subtools are portal/runtime-discovered and may not appear in local YAML. Do not hand-author `knownTools` or mutate `action.operationDetails`. If subtools are missing, turn the MCP tool off, refresh tools, turn it back on, then validate in Activity Map.
- Local knowledge descriptor YAML is only a Get Changes mirror. It is never the ingestion mechanism for uploaded files.
- Topic-owned MCP or connector execution nodes need a portal-generated or verified template pattern before CPSAgentKit writes them directly.

### Product Priorities From This Build

1. Productize backend file knowledge upload as a first-class CPSAgentKit command.
2. Productize reference-backed connector action, MCP attachment, and Teams publishing scaffolds for known-good first-party patterns.
3. Add tenant-aware Dataverse auth checks using `.mcs/conn.json` `DataverseEndpoint` and `AccountInfo.TenantId`.
4. Add MCP discovery validation and the off-refresh-on remediation to tool workflows.
5. Support guarded manual child-agent scaffolding for instruction-only children.
6. Keep reference-backed action scaffolding gated behind explicit opt-in or known-good exports until the product has first-class commands for each pattern.
7. Track components through: `locally generated`, `local diagnostics clean`, `Apply Changes accepted`, `portal-visible`, `portal-enabled`, `runtime-discovered`, `Get Changes preserved`, and `Activity Map validated`.
