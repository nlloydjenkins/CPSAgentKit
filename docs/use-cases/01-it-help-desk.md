# Use Case 1 — IT Help Desk Agent

## Background

Contoso Ltd (1,200 employees across London, Manchester, and Edinburgh) is replacing its email-based IT support with a multi-agent Copilot Studio solution published to Microsoft Teams. The existing shared mailbox (`itsupport@contoso.com`) is triaged by two analysts. Average first-response time is 4 hours; the target is under 5 minutes for common issues.

The solution uses a parent orchestrator coordinating specialist child agents so each domain (knowledge lookup, ticket management, notifications) is owned by a dedicated agent.

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
