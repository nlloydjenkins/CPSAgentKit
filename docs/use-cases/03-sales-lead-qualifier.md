# Use Case 3 — Sales Lead Qualifier Agent

## Background

Northwind Traders receives 150–300 inbound sales enquiries per week to `sales@northwind.com`. Business Development Representatives (BDRs) currently read each email, check whether the company already exists in Dynamics 365 / Dataverse, score the lead manually against a qualification rubric (BANT-lite), and assign it to an Account Executive (AE). First-touch response averages 18 hours; the target is under 10 minutes for qualified leads.

The solution is event-driven by the shared mailbox. A single parent orchestrator owns the pipeline. Extraction and scoring are implemented as **prompt tools** (not child agents) because both produce strict structured output that would be degraded by generative-orchestration summarisation between child-agent hops. The parent owns all Dataverse access, since MCP tools on child agents do not execute when called through parent orchestration.

## Build-Time Configuration

The Northwind/sample values are placeholders. During Build, CPSAgentKit must ask the maker to confirm or replace the tenant-specific values before finalising tenant-bound assets such as mailbox/channel references, SharePoint URLs, prompt instructions, connector descriptions, or portal setup steps. Missing values should block only the specific tenant-bound action that needs them; Build should still perform safe work that does not depend on those values, such as planning, neutral Dataverse schema reconciliation, topic-shell scaffolding, and exact portal-step generation:

- Inbound sales shared mailbox, default `sales@northwind.com`
- Trigger service account / mailbox owner
- Shared sales Teams channel, default `#sales-leads`
- Sales Ops escalation Teams channel
- AE routing source: Account owner field, regional pod owner table, or explicit routing table
- Dataverse publisher prefix and whether standard `account`, `lead`, `opportunity`, and `contact` tables are used as-is or customised
- SharePoint site/library paths for scoring rubric, product catalogue, and regional pod assignment
- Outbound acknowledgement mailbox/send-as identity and business-hours calendar/time zone rules

## Primary Users and Channel

- **Prospects** — email the shared mailbox. They never chat with the agent.
- **Account Executives** (12 across EMEA pods) — receive routing notifications in their own Teams DM plus a shared `#sales-leads` Teams channel for the pod.
- **Sales Operations** (2 analysts) — review escalated or low-confidence leads via a Power App.
- Trigger service account authenticates via Entra ID.

## What the Solution Should Do

1. **Monitor a shared mailbox** (`sales@northwind.com`) for new enquiries. Autonomous trigger on the parent.
2. **Preprocess attachments** (PDF briefs, RFP docs) into text via a **prompt tool with code interpreter** (stdlib-only sandbox). Unsupported types or files >5MB escalate to Sales Ops.
3. **Extract lead fields** via the **Lead Extractor prompt tool**: sender name, sender email, company name (inferred from signature / email domain), stated product interest, budget signals, timeline signals, region, company size hints. Return JSON captured by `predictionOutput`. For fields not present, return the literal string `"N/A"` to prevent interactive prompting.
4. **Match against existing Dataverse accounts** via the **Dataverse MCP Server** (owned by the parent) — exact email domain match first, then fuzzy company name match. Return one of: `EXISTING_CUSTOMER`, `EXISTING_PROSPECT`, `NEW`.
5. **Score the lead** via the **Lead Scorer prompt tool** on a 0–100 scale using a weighted rubric (budget 30, authority signals 20, need clarity 25, timeline 15, fit 10). Scoring rubric is stored as a SharePoint knowledge document scoped to the Lead Scorer prompt.
6. **Create or update a Lead record** in Dataverse via pre-bound "Add a new row" / "Update a row" connector actions (not the generic dynamic action, which binds to a single table per conversation):
   - `NEW` → create a Lead with full extracted payload
   - `EXISTING_PROSPECT` → update the existing Lead, append email to timeline
   - `EXISTING_CUSTOMER` → create an Opportunity linked to the Account instead
7. **Route the lead** based on score:
   - Score ≥ 70 → assign to the AE owning the Account (or regional pod owner for `NEW`), post to the pod's `#sales-leads` Teams channel, send Teams DM to the AE with adaptive card (Accept / Reassign / Reject buttons)
   - Score 40–69 → assign to the shared nurture queue, no Teams notification
   - Score < 40 → assign to Sales Ops review queue with a short justification
8. **Handle thread replies** — if the prospect replies before an AE accepts, append the new content to the Lead timeline and re-score. If score crosses a threshold, re-notify.
9. **Send an acknowledgement email** from the shared mailbox within 10 minutes for any score ≥ 40. Draft is templated; agent personalises with the prospect's name and stated product interest. No promises about timelines or pricing.
10. **Escalate to Sales Ops** via Teams adaptive card when: extraction confidence is low, the email is clearly not a sales enquiry (invoice query, support request, recruiter spam), or the scoring rubric can't be applied.

## What the Solution Should NOT Do

- Commit to pricing, discounts, timelines, or feature roadmap in the acknowledgement email
- Auto-accept or auto-reject a lead on behalf of an AE — routing proposes, AE decides
- Create duplicate Leads when an Account already exists (match first, then decide)
- Share scoring details, internal account data, or pipeline stage with the prospect
- Use general knowledge or web browsing for enrichment — only Dataverse and the scoring rubric in SharePoint
- Process non-sales email (support, invoicing, recruiter spam) — those escalate or are suppressed
- Notify AEs on weekends or outside business hours (queue them for Monday 08:00 local)

## Success Criteria

- Qualified (score ≥ 70) leads produce an AE Teams DM + channel post within 10 minutes of email receipt
- 85% of incoming emails matched correctly against existing Dataverse accounts (verified against sales-ops weekly audit)
- Acknowledgement email sent within 10 minutes for every score ≥ 40
- No duplicate Lead records created for domains already in Dataverse
- Non-sales emails correctly escalated or suppressed 95% of the time
- BDR time saved: 6+ hours per week per BDR (baseline: 15 mins per lead × 30 leads)

## Systems and Tools

- **Trigger:** Office 365 Outlook — shared mailbox event trigger (owned by the parent)
- **Attachment preprocessor:** prompt tool with code interpreter (stdlib-only)
- **Extraction and scoring:** AI Builder prompt tools (Lead Extractor, Lead Scorer) authored in AI Hub, synced locally
- **Account / Lead / Opportunity lookup:** Dataverse MCP Server (owned by the parent)
- **Lead / Opportunity writes:** pre-bound Dataverse connector actions — one per target table (`lead`, `opportunity`, `contact`), generic dynamic action disabled
- **Knowledge:** SharePoint — `Sales Enablement` library with `lead-scoring-rubric.md`, `product-catalogue.md`, `regional-pod-assignment.md`
- **Outbound acknowledgement:** Office 365 Outlook — send from shared mailbox
- **AE notifications:** Microsoft Teams — channel post + DM adaptive card
- **Escalation:** Microsoft Teams adaptive card to Sales Ops channel

## Platform Considerations

- **Prompt tools over child agents for extraction and scoring.** Both produce strict structured output (extracted JSON, numbered score criteria). Child agents would have their responses summarised between stages. Use prompt tools invoked from a single topic on the parent.
- **Parent owns MCP.** Dataverse account-match tools run on the parent. Any future child agents for specialist handling must not own MCP tools.
- **Scheduled triggers on parent only.** Re-scoring on thread replies and the business-hours queue both sit on the parent.
- **N/A sentinel for optional extracted fields.** Budget, timeline, company size, region are often absent — the Lead Extractor prompt must return `"N/A"` for any unknown value. Empty string or null will break into interactive mode.
- **Dataverse choice columns (lead source, status, rating) require integer values.** Include mappings in connector action input descriptions and agent instructions.
- **Pre-bound connector actions per table.** Creating a Lead and an Opportunity in the same conversation hits `UnresolvedDynamicType` with the generic action — use one pre-bound action per target table.
- **Every dynamic input needs a description.** Include value source ("from the Lead Extractor output"), format, and "never ask the user" for autonomous pipelines.
- **Anti-termination instructions required.** Add a CRITICAL header and per-stage suppression — otherwise the orchestrator may display the Extractor's JSON to the user and stop.
- **Power Automate flow identity.** The Teams DM / channel notification flow runs as the maker by default. For user-attributed routing, configure per-connection invoker identity on the Teams connector, or use a dedicated service maker account and document it.
- **Content moderation:** set in the portal (manual portal step).

## Tone and Behaviour

- Acknowledgement emails: warm, professional, concise (under 120 words)
- Reference what the prospect wrote — don't send a generic template
- Never fabricate product features, prices, or commitments
- AE Teams DMs: brief, scannable adaptive card with lead name, score, one-line justification, and action buttons

## Language and Compliance

- English only
- All lead scoring, extraction, and routing decisions logged to Dataverse for audit (6 months minimum)
- No personal data beyond sender contact details + business-relevant extraction
- Content moderation: Medium
- General knowledge: disabled. Web browsing: disabled. All enrichment comes from Dataverse + SharePoint rubric.

## Sample Interactions

**1. Qualified new lead**

> Inbound email: "Hi, we're a 400-person manufacturer in Munich looking at warehouse automation. Budget around €150k, want to decide by end of Q2. Can you send pricing?"
> Agent: extracts fields, no account match, creates `NEW` Lead in Dataverse, score 82, posts adaptive card to EMEA-DACH Teams channel and DMs the pod AE, sends prospect a personalised acknowledgement referencing "warehouse automation" and confirming an AE will reach out within one business day. No price mentioned.

**2. Existing customer expansion**

> Inbound email from `procurement@fabrikam.com` (known Account).
> Agent: matches Account, creates an **Opportunity** linked to Fabrikam (not a Lead), notifies the Account's current AE directly.

**3. Out-of-scope**

> Inbound email: "I have an invoice query — order #12345 hasn't shipped."
> Agent: classifies as non-sales, does not create Lead, escalates to Sales Ops with suggestion to forward to Customer Service, suppresses acknowledgement.
