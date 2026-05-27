# Use Case 5 — Meeting Prep Briefer

## Background

Account Executives and Customer Success Managers at Adventure Works spend 30–60 minutes per day preparing for external meetings: checking the attendee's recent activity in Dynamics 365 / Dataverse, skimming the last 3 emails in the thread, pulling the latest account plan from SharePoint, and checking open support tickets. They often skip this prep under time pressure, which shows in the meeting.

The solution is an autonomous agent that runs on a scheduled trigger each weekday morning (07:00 user local time) and 30 minutes before each external meeting. It compiles a concise brief and delivers it via Teams DM to the meeting owner. No user chat required — the agent proactively serves the user.

## Build-Time Configuration

The Adventure Works/sample values are placeholders. During Build, Agent Workbench must ask the maker to confirm or replace the tenant-specific values before finalising tenant-bound schema names, connector descriptions, prompt instructions, or portal setup steps. Missing values should block only the specific tenant-bound action that needs them; Build should still perform safe work that does not depend on those values:

- Internal email domains used to identify external meetings, default `@adventure-works.com`
- User population or security group to brief
- Daily digest time, pre-meeting lead time, working days, working hours, and time-zone source
- SharePoint Account Plans library path
- Dataverse publisher prefix/table name for preferences if not using `cr85a_briefpreferences`
- Teams delivery flow owner/service account and DM delivery identity
- PTO suppression source: Outlook automatic replies or Dataverse preference/status table

## Primary Users and Channel

- **Account Executives and Customer Success Managers** (~50 users) — receive briefings as Teams DMs from the agent
- **Managers** can opt into a daily digest summarising the team's external meetings
- Authenticated via Microsoft Entra ID; connector actions use per-connection invoker identity so each user's own Outlook calendar, mailbox, and Dataverse-permitted records are accessed under their credentials — not the agent maker's

This solution uses a single parent agent. The briefing generation stage is implemented as an **AI Builder prompt tool** (not a child agent) because the output is a strict structured adaptive-card schema and generative-orchestration summarisation would degrade the format. A Calendar Scanner stage is implemented as a topic on the parent that invokes the Outlook Calendar and Dataverse connectors directly — not a separate agent.

## What the Solution Should Do

1. **Run on a daily schedule** (weekdays 07:00 user local time) — scan the user's Outlook calendar for the next 24 hours. Send a morning digest Teams DM listing external meetings with a one-line summary each.
2. **Run 30 minutes before each external meeting** — scheduled per-meeting trigger (or a single 5-minute polling schedule filtering to meetings starting in the next 30 minutes). Deliver a full brief.
3. **Identify external meetings** — attendee list contains at least one address outside `@adventure-works.com`. Skip internal-only meetings.
4. **Resolve external attendees** to Dataverse Contacts via email. If no match, flag as "unknown contact" in the brief.
5. **Resolve the Account** — from the matched Contact(s), get the parent Account. If multiple different Accounts match, flag as "multi-account meeting — please review".
6. **Pull context for the brief** (via **Dataverse MCP Server**):
   - Account summary (name, industry, ARR, renewal date, segment)
   - Last 3 Opportunities (stage, value, close date)
   - Open Support Cases (count, severity breakdown)
   - Last meeting note on this Account (if any)
7. **Pull the current account plan** from SharePoint — search the `Account Plans` library for a file matching the Account name. Include the last-modified date and a 2-sentence extract of the "Current objectives" section.
8. **Pull recent email context** — search the user's Outlook mailbox for the last 3 emails in the thread with the external attendees over the past 30 days. Extract sender, date, and a 1-line summary of each. (Use the **Outlook Search Emails** connector action, scoped to the meeting owner.)
9. **Synthesise the brief** via the **Briefing Composer prompt tool** into a structured Teams adaptive card:
   - Meeting title, time, attendees (internal + external with role)
   - Account snapshot (2–3 bullets)
   - Recent activity (opportunities, cases)
   - Last touchpoint summary (emails / prior meetings)
   - Suggested talking points (3 bullets, grounded strictly in the above data)
   - Red flags (open severity-1 case, overdue renewal, stalled opportunity)
10. **Deliver via Teams DM** — a Power Automate flow (scaffolded from CPS, authored in the Power Automate portal) sends the adaptive card to the meeting owner as a DM. Invoker identity is configured on the Teams connection inside the flow so the DM is delivered in the correct user context.
11. **Let the user suppress a brief** — adaptive card has a "Snooze next brief" and "Stop briefing this meeting" button. Preferences stored in Dataverse (`cr85a_briefpreferences`).
12. **Respect privacy** — only access the meeting owner's own calendar and mailbox; never read another user's mailbox. Use delegated Graph permissions.

## What the Solution Should NOT Do

- Send briefs for internal-only meetings
- Access mailboxes or calendars of users who haven't opted in
- Summarise email content into the brief verbatim — use 1-line abstractions
- Guess talking points that aren't supported by Dataverse, SharePoint, or the email thread
- Fabricate Account details, renewal dates, opportunity values, or competitive positioning
- Share one user's Account context with another user (a brief is strictly for the meeting owner)
- Send briefs outside working hours or on user-configured PTO days (check Outlook "Automatic replies" status)
- Use general knowledge or web browsing for competitive intel or industry context — the brief is grounded in first-party data only

## Success Criteria

- 95% of external meetings have a brief delivered 25–35 minutes before start time
- Brief contains Account snapshot, recent activity, last touchpoint, and 3 talking points in every case where Dataverse has the data
- "Unknown contact" cases correctly flagged (verified against manual audit sample)
- No brief delivered for internal-only meetings
- Users can snooze or disable per-meeting briefs, and preference is respected on subsequent runs
- AEs self-report 20+ minutes saved per meeting (quarterly pulse survey)

## Systems and Tools

- **Scheduled triggers:** owned by the parent agent — daily 07:00 digest, and a 5-minute polling schedule that filters to meetings starting in 25–35 minutes. Child agents cannot own triggers.
- **Calendar access:** Office 365 Outlook — "Get events (V4)" connector action, invoker identity (per-connection override)
- **Mailbox search:** Office 365 Outlook — "Find emails (V3)" connector action, invoker identity
- **Account / Contact / Opportunity / Case lookup:** Dataverse MCP Server (parent-owned)
- **Preference store:** Dataverse — `cr85a_briefpreferences` table via pre-bound connector actions
- **Account plan search:** SharePoint — "Find files in folder" or Search action scoped to the `Account Plans` library
- **Brief composer:** AI Builder prompt tool (authored in AI Hub, synced locally) — returns adaptive-card JSON captured via `predictionOutput`
- **Teams delivery:** Power Automate flow — posts adaptive card as DM, with invoker identity on the Teams connection
- **Authentication:** Microsoft Entra ID (agent configured for Entra ID auth; users consent to each delegated connector connection on first use)

## Platform Considerations

- **Prompt tool, not child agent, for briefing composition.** The adaptive-card schema is strict structured output; a child agent would have its response summarised and the card structure would break. Invoke the prompt tool from a topic on the parent and capture `predictionOutput`.
- **Scheduled triggers on the parent only.** Child agents cannot own autonomous triggers.
- **Autonomous runs always consume Copilot Credits** regardless of M365 Copilot licensing. Factor the daily digest (50 users × 1 run) and the per-meeting briefs (50 users × ~3 meetings/day) into capacity planning.
- **Parent owns MCP.** Dataverse MCP Server tools run on the parent. Do not attempt to give any future child agent its own MCP tools.
- **Per-connection invoker identity is the delegation mechanism.** CPS does not expose delegated Graph scopes directly — user-context access is achieved by configuring "Provided by run-only user" on each individual connector connection inside the Teams delivery flow and on each Outlook / Dataverse connector action on the parent. Test each connection type; not all support delegated identity.
- **Outlook "Get events (V4)" and "Find emails (V3)"** — use these (not deprecated V1/V2 variants). Validate connector payload limit (5 MB public, 450 KB GCC) when emails have large bodies; truncate in the flow before returning.
- **Cloud flow timeout: 100 seconds.** The Teams delivery flow must finish within 100 seconds. If brief generation is slow, split: parent assembles data → prompt tool composes card → flow only sends the pre-built card.
- **10-turn history limit doesn't help here** — this is an autonomous agent, state lives in Dataverse (the `cr85a_briefpreferences` table), not conversation.
- **Every dynamic connector input needs a description** including value source and "never ask the user".
- **PTO suppression via Outlook "Automatic replies" status** is workable but check the connector action is available in your tenant's DLP policy. If not, fall back to a `Status` field on the preference table.
- **Content moderation:** set in the portal (manual step).
- **Per-user data isolation.** Because connector connections run with invoker identity, a user can only read Dataverse records they have permission to read — the platform enforces this. Do not add instructions claiming additional isolation; rely on Dataverse security roles.

## Tone and Behaviour

- Brief, factual, skimmable — this is prep material, not prose
- Lead with the single most important fact (e.g., "Renewal in 14 days, one open Sev-2")
- Use short bullets, not paragraphs
- Never speculate about the attendee's mood, intent, or competitor activity
- If data is missing, say so explicitly ("No account plan found in SharePoint") rather than inventing

## Language and Compliance

- English only
- Briefing delivery and preference changes logged in Dataverse for audit
- Strict per-user data isolation — user A can never see Account data for an Account that user A doesn't have Dataverse access to
- Content moderation: Medium
- General knowledge: disabled. Web browsing: disabled. All content grounded in Dataverse, SharePoint, and the owner's mailbox.

## Sample Interaction

**1. Pre-meeting brief (30 minutes before)**

> Teams DM (adaptive card):
>
> **Meeting:** Q3 Renewal Review — Alpine Outdoor Co. — 10:30 today
> **External:** Lena Hofer (VP Ops, alpineoutdoor.ch), Jonas Meier (Procurement)
> **Account:** Alpine Outdoor Co. | Retail | ARR £240k | Renewal 15 Oct (28 days)
> **Recent activity:**
>
> - Opportunity: "FY26 expansion — 3 new regions" — stage `Proposal` — £180k
> - 1 open Case — Sev-2 — "Inventory sync latency" — opened 4 days ago
>
> **Last touchpoint:** Email 2 days ago from Lena — asking for updated renewal quote
> **Talking points:**
>
> - Confirm renewal terms; the quote was requested 2 days ago and not yet sent
> - Progress the expansion opportunity — currently in Proposal stage
> - Acknowledge the open Sev-2 Case and give status
>
> **Red flag:** Renewal in 28 days + unanswered quote request.
>
> [Snooze next brief] [Stop briefing this meeting]

**2. Morning digest**

> Teams DM: "3 external meetings today. 10:30 Alpine Outdoor (renewal in 28 days, open Sev-2). 13:00 Northwind (expansion opp, no red flags). 16:00 Unknown contact — please review before joining."
