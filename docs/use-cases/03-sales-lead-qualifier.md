# Use Case 3 — Sales Lead Qualifier Agent

## Background

Northwind Traders receives 150-300 inbound sales enquiries per week. Business Development Representatives currently read each enquiry, check whether the company already exists in Dynamics 365 / Dataverse, score the lead against a BANT-lite rubric, and assign it to an Account Executive. First-touch response averages 18 hours; the target is to qualify high-value leads in minutes and give Sales a consistent handoff.

This use case is intentionally build-friendly for CPSAgentKit. The first version is a single Copilot Studio agent used by Sales Operations or BDRs in Teams: a user pastes or forwards an inbound enquiry, the agent qualifies it, checks Dataverse, creates or updates the right sales record, and drafts the next action. Autonomous mailbox monitoring, adaptive cards, and shared-mailbox sending are optional phase 2 enhancements after the core qualification loop works.

## Build-Time Configuration

Northwind values are sample defaults. During Build, CPSAgentKit must ask the maker to confirm or replace only the tenant-specific values needed for the next blocked action. Missing values should not block neutral schema planning, instructions, topics, or Dataverse MCP work.

- Sales mailbox or intake source, default `sales@northwind.com`
- Sales Teams channel for qualified lead notifications, default `#sales-leads`
- Sales Ops escalation channel
- Dataverse publisher prefix and whether standard `account`, `lead`, `opportunity`, and `contact` tables are used as-is
- AE routing source: Account owner, regional owner table, or a simple manually maintained routing table
- Lead scoring rubric and product catalogue documents to upload directly to Copilot Studio
- Business hours and time zone for expected follow-up wording

## Primary Users and Channel

- **BDRs and Sales Operations** use the agent in Microsoft Teams to qualify inbound enquiries.
- **Account Executives** receive qualified lead handoff notes in Teams or Dataverse.
- **Prospects** do not chat with the agent in v1. Any prospect-facing email is drafted for review, not sent automatically.

## What the Solution Should Do

1. **Accept a pasted or forwarded sales enquiry** from a BDR or Sales Ops user. The enquiry may include sender name, sender email, company name, product interest, budget, timeline, region, and company size hints.
2. **Classify the enquiry** as `SALES_LEAD`, `EXISTING_CUSTOMER_EXPANSION`, `NON_SALES`, or `NEEDS_REVIEW`. Non-sales messages are escalated to Sales Ops and do not create a Lead.
3. **Extract lead fields** into a structured summary. Unknown optional fields must use the literal value `N/A` so the agent does not ask for missing autonomous-style inputs unnecessarily.
4. **Check Dataverse through the Dataverse MCP Server** owned by the parent agent:
   - Match email domain to an existing Account first.
   - If no domain match exists, search by company name.
   - Return `EXISTING_CUSTOMER`, `EXISTING_PROSPECT`, or `NEW`.
5. **Score the lead from 0-100** using a rubric uploaded directly to Copilot Studio: budget 30, authority signals 20, need clarity 25, timeline 15, fit 10.
6. **Recommend a routing outcome**:
   - Score 70 or above: qualified lead; assign to Account owner or regional AE.
   - Score 40-69: nurture queue.
   - Score below 40: Sales Ops review or suppress if clearly non-sales.
7. **Create or update Dataverse records** when the Dataverse MCP Server is configured and tenant auth is aligned:
   - `NEW` or `EXISTING_PROSPECT`: create or update a Lead record.
   - `EXISTING_CUSTOMER`: create an Opportunity linked to the Account.
   - Always store extraction summary, score, classification, routing recommendation, source email, and audit notes.
8. **Draft the next action**:
   - A short AE handoff note for qualified leads.
   - A concise prospect acknowledgement draft for score 40 or above.
   - A Sales Ops review note for low-confidence or non-sales enquiries.
9. **Keep the user in control**. The v1 agent recommends and drafts; it does not auto-send prospect emails, auto-accept leads for AEs, or create unsupported records without confirmation.

## What the Solution Should NOT Do

- Commit to pricing, discounts, implementation timelines, or roadmap items.
- Auto-accept, auto-reject, or reassign leads on behalf of an Account Executive.
- Create duplicate Leads when an Account or active Lead already exists.
- Share internal score details, account data, or routing logic with a prospect.
- Use web browsing or general knowledge for enrichment.
- Process support, invoice, procurement, recruiter, or spam messages as sales leads.

## Success Criteria

- BDR can paste an enquiry and receive classification, score, Dataverse match, routing recommendation, and draft handoff in under 2 minutes.
- 85% of sampled enquiries match the correct Account or are correctly classified as new.
- Qualified leads include a clear AE handoff note with product interest, urgency, and score rationale.
- No duplicate Lead is created when a matching Account or active Lead exists.
- Non-sales messages are escalated or suppressed consistently.

## Systems and Tools

- **Channel:** Microsoft Teams.
- **Knowledge:** Lead scoring rubric and product catalogue uploaded directly to Copilot Studio as the agent's knowledge source (no SharePoint dependency).
- **Dataverse lookup and writes:** Dataverse MCP Server owned by the parent agent.
- **Optional notification:** Microsoft Teams channel post after real connection references are available.
- **Optional phase 2 automation:** Outlook shared mailbox trigger, shared-mailbox acknowledgement send, adaptive-card AE workflow, and business-hours queue.

## Recommended CPSAgentKit Build Shape

Use a single parent agent for v1. Do not create child agents or prompt tools unless the maker explicitly chooses a later automation phase.

### Parent Agent Responsibilities

- Classify inbound enquiry text.
- Extract fields and preserve unknown optional values as `N/A`.
- Use Dataverse MCP to match Account / Lead / Opportunity records.
- Score the lead using the uploaded rubric.
- Create or update Dataverse records through MCP when configured.
- Draft AE handoff, prospect acknowledgement, or Sales Ops review notes.

### Deterministic Topics

- **Qualify Sales Enquiry** — main topic for pasted or forwarded enquiry text. Collects missing minimum fields only when the user is present.
- **Check Lead Status** — optional topic to look up an existing Lead or Opportunity.
- **Escalate to Sales Ops** — creates an escalation note when the message is non-sales, low confidence, or outside scope.

### Dataverse Tables and Fields

Prefer standard Dataverse sales tables when they exist. If the environment does not have Dynamics Sales tables available, create a small custom `lead_qualification` table for the sample with these fields:

- enquiry subject
- sender name
- sender email
- company name
- product interest
- region
- classification
- account match status
- score
- routing outcome
- AE or queue owner
- source text excerpt
- audit notes

Choice columns must use verified integer mappings after schema creation. Include those mappings in agent instructions and tool descriptions.

## Platform Considerations

- **Keep v1 interactive.** Autonomous mailbox triggers, business-hours queues, adaptive cards, and shared-mailbox sends are useful but add portal and Power Automate complexity. Treat them as phase 2 once the core qualification loop is accepted.
- **Parent owns MCP.** Dataverse MCP belongs on the parent agent. Do not move MCP tools to child agents.
- **No prompt tools by default.** The first version can classify, extract, score, and draft through parent instructions plus the uploaded rubric. Prompt tools are optional later if the maker needs strict JSON output or temperature control.
- **No action YAML without real bindings.** Teams or Outlook connector action YAML may only be created when the active workspace contains real tenant connection reference logical names and matching root/exported bindings. Otherwise checklist connector creation/sync as a blocker.
- **Content moderation is portal-only.** Set to Medium in the portal.
- **General knowledge and web browsing disabled.** Ground qualification in the enquiry text, Dataverse, and the uploaded rubric/product catalogue.

## Tone and Behaviour

- AE handoff notes are brief and scannable: company, contact, product interest, score, reason, recommended next step.
- Prospect acknowledgement drafts are warm, professional, and under 120 words.
- Never invent product capabilities, prices, commitments, or Account facts.
- When confidence is low, route to Sales Ops instead of guessing.

## Language and Compliance

- English only.
- Store qualification decisions and score rationale for audit for at least 6 months.
- Personal data is limited to business contact details and business-relevant enquiry content.
- Content moderation: Medium.
- General knowledge: disabled. Web browsing: disabled.

## Optional Phase 2 Enhancements

Add these only after v1 works and the maker has the required tenant connections and portal setup:

1. Outlook shared mailbox trigger for `sales@northwind.com`.
2. Automatic prospect acknowledgement from the shared mailbox for score 40 or above.
3. Teams channel notification for qualified leads.
4. Adaptive-card AE workflow with Accept / Reassign / Reject buttons.
5. Business-hours queue that delays AE notification outside working hours.
6. Attachment preprocessing for PDF or RFP text. Use a prompt tool with code interpreter only after testing the sandbox path; avoid designs that depend on third-party Python packages.

## Sample Interactions

**1. Qualified new lead**

> User: Qualify this enquiry: "Hi, we're a 400-person manufacturer in Munich looking at warehouse automation. Budget around EUR 150k, want to decide by end of Q2. Can you send pricing?"
> Agent: Classifies as `SALES_LEAD`, no Account match, score 82, recommends EMEA-DACH AE routing, creates or drafts a Lead record, and returns an AE handoff plus a safe acknowledgement draft with no pricing commitment.

**2. Existing customer expansion**

> User: Qualify this email from procurement@fabrikam.com: "We want to expand warehouse automation to two more sites. Can our account team contact us?"
> Agent: Matches Fabrikam as an existing Account, classifies as `EXISTING_CUSTOMER_EXPANSION`, recommends creating an Opportunity linked to the Account, and drafts the AE handoff.

**3. Out-of-scope**

> User: Qualify this enquiry: "I have an invoice query — order 12345 has not shipped."
> Agent: Classifies as `NON_SALES`, does not create a Lead, and drafts a Sales Ops escalation note suggesting transfer to Customer Service.
