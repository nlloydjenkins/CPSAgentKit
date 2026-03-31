# IT Help Desk — Business Requirements

## Background

Contoso Ltd (1,200 employees across London, Manchester, and Edinburgh) is replacing its current email-based IT support workflow with a multi-agent Copilot Studio solution published to Microsoft Teams. The existing process relies on a shared mailbox (itsupport@contoso.com) that is triaged manually by two IT analysts. Average first-response time is 4 hours; the target is under 5 minutes for common issues.

The solution should use multiple specialist agents coordinated by a parent orchestrator so that each domain (knowledge lookup, ticket management, notifications) is owned by a dedicated agent.

## Primary Users

- All Contoso employees via Microsoft Teams (desktop and mobile)
- IT Support Team (6 analysts) who resolve escalated tickets

## What the Solution Should Do

1. **Answer common IT questions** from an approved knowledge base (company IT wiki on SharePoint). Examples: "How do I connect to VPN?", "What's the Wi-Fi password for the Manchester office?", "How do I set up MFA?" This capability should live in a dedicated Knowledge Specialist child agent.
2. **Create support tickets** in Dataverse when the agent cannot resolve the issue from knowledge alone. Capture: employee name, email, issue summary, priority (Low / Medium / High), office location, and device type. Dataverse access must use the Dataverse MCP Server — not the standard Dataverse connector.
3. **Check ticket status** — employees should be able to ask "What's the status of my ticket?" and get a live answer from Dataverse via MCP.
4. **Look up the user's profile** — the parent should be able to identify the authenticated user.
5. **Notify the IT team** for High and Critical tickets:
   - Post a message in the **IT Support** Teams channel with ticket details
   - Send an email to itsupport@contoso.com via Outlook
     This notification capability should live in a dedicated Notification Specialist child agent.
6. **Update a ticket** — employees should be able to update their own tickets by referring to the ticket name (e.g. "update Broken Laptop Screen"). The agent finds the ticket by matching `cr85a_name` and the user's email (`cr85a_employee_email`). If ambiguous, list the user's tickets and ask to clarify. Updatable fields: issue summary, priority, status, device type, and office location.
7. **Delete a ticket** — employees should be able to delete their own tickets by saying "delete [ticket name]". The agent finds the ticket, shows details, and requires explicit confirmation before deleting. Users can only delete their own tickets.
8. **Escalate to a human agent** when the employee explicitly asks or when the issue is classified as Critical (e.g. security incident, data breach suspicion, complete system outage).

## What the Solution Should NOT Do

- Reset passwords or modify Active Directory accounts (security policy prohibits automated credential changes)
- Access or modify HR, Finance, or CRM systems
- Provide answers about non-IT topics (HR policies, expenses, facilities)
- Share internal infrastructure details like server names, IP ranges, or admin credentials
- Create tickets on behalf of other employees (the ticket is always for the person chatting)
- Update or delete tickets belonging to other employees
- Use general knowledge or web browsing — all answers must come from the SharePoint knowledge base or Dataverse

## Success Criteria

- 70% of common IT questions answered from the knowledge base without needing a ticket
- Support tickets created in Dataverse within 30 seconds of the employee confirming the details
- High/Critical tickets produce both a Teams channel post and an email notification within 15 seconds
- Escalation to human analyst completes within 10 seconds with full context passed
- Employee satisfaction rating of 4+ out of 5 in post-interaction survey

## Tone and Behaviour

- Professional but approachable — not robotic
- Use the employee's first name when available
- If uncertain, say "I don't have that information — let me create a ticket for the IT team" rather than guessing
- Never fabricate a solution; always ground in the knowledge base or escalate

## Languages

- English only (all Contoso employees work in English)

## Compliance and Data

- All interactions must be logged for audit purposes (minimum 90-day retention)
- No personal data beyond what is needed for the ticket (name, email, location, device type)
- The agent must authenticate users via Microsoft Entra ID — no anonymous access
