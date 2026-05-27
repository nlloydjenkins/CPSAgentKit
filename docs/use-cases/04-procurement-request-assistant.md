# Use Case 4 — Procurement Request Assistant

## Background

Fabrikam Inc. (3,500 employees) runs procurement through a legacy web portal that staff find slow and confusing. Most requests under £500 are for standard items (laptops, monitors, software licences, office supplies) already in an approved catalogue, but employees still fill in 11 fields by hand, then wait an average of 5 days for manager approval and PO issuance.

The solution is a conversational agent in Microsoft Teams that guides the employee through a request, looks up the approved catalogue, validates against policy, creates a Purchase Order in Dataverse, and routes approval to the line manager via adaptive card. A Power Automate flow handles the approval routing and PO status transitions.

## Build-Time Configuration

The Fabrikam/sample values are placeholders. During Build, Agent Workbench must ask the maker to confirm or replace the tenant-specific values before finalising tenant-bound schema names, connector descriptions, prompt text, or portal setup steps. Missing values should block only the specific tenant-bound action that needs them; Build should still perform safe work that does not depend on those values:

- Organisation name, default currency, and office/location defaults
- Procurement escalation Teams team/channel, default `#procurement-exceptions`
- Approved catalogue SharePoint list name and site URL, default `ApprovedCatalogue`
- Procurement policy/restricted-items knowledge document locations
- Dataverse publisher prefix/table name if not using `cr85a_purchaseorder`
- Approval flow owner/service account and line-manager lookup source
- Financial thresholds and audit-retention requirement

## Primary Users and Channel

- **All Fabrikam employees** via Microsoft Teams (desktop and mobile)
- **Line managers** — receive approval requests as Teams adaptive cards in their own DM
- **Procurement team** (4 people) — see escalations for non-catalogue items or policy exceptions in a shared `#procurement-exceptions` Teams channel
- Authenticated via Microsoft Entra ID

A single-agent design is acceptable here — the scope is tight and tool count is comfortably under 10.

## What the Solution Should Do

1. **Greet the user and understand intent** — common phrases: "I need a new laptop", "Order me another monitor", "What's the status of my last request?", "I need a non-standard item".
2. **Look up the user's profile** using the Office 365 Users **"Get my profile (V2)"** action (not "Get user profile (V2)" which requires a UPN input) to determine cost centre, line manager, and office location.
3. **Search the approved catalogue** (SharePoint list `ApprovedCatalogue`) for matching items by keyword. Present top 3 matches as an adaptive card with name, spec, unit cost, and "Select" buttons.
4. **Validate request against policy** (procurement policy document uploaded directly to Copilot Studio as a knowledge source):
   - Under £500 and in catalogue → single approval (line manager)
   - £500–£2,500 → line manager + department head
   - Over £2,500 or non-catalogue → escalate to Procurement team
   - Items restricted by role (e.g., dev tools only for Engineering) → check the user's department from their profile
5. **Collect request details** via adaptive card: quantity, delivery address (default: user's office), justification (required for non-standard items or quantity > 1), cost centre (default: user's cost centre).
6. **Create a Purchase Order record** in Dataverse (`cr85a_purchaseorder`) via **Dataverse MCP Server**. Fields: requester email, line manager, items (JSON as text), total, cost centre, status (choice column — pass integer, not the label), policy tier. Include the integer mapping for the Status choice column in the tool description (e.g. `PendingApproval=100000000`, `Approved=100000001`, `Rejected=100000002`, `Cancelled=100000003`) — verify against the live schema after table creation.
7. **Trigger a Power Automate flow** to send an approval adaptive card to the line manager in Teams. The flow handles the approval decision and updates the PO status. **The flow is authored in the Power Automate portal, not locally.**
8. **Confirm to the requester** that the PO has been created, show the PO number, state who needs to approve next, and give an expected turnaround ("Most approvals come back within 24 hours").
9. **Check status of existing requests** — "what's the status of PO-1234?" or "show my open requests". Queries Dataverse MCP scoped to the authenticated user's email.
10. **Cancel a pending request** — user can cancel their own PO before approval. Require explicit confirmation. After approval, cancellation must go through procurement (escalate).
11. **Escalate to Procurement** for non-catalogue items or values over £2,500, by posting to the `#procurement-exceptions` Teams channel with the full conversation context and any attached quote.

## What the Solution Should NOT Do

- Approve a PO on behalf of a manager — routing only, the human approves via adaptive card
- Create or update POs for another employee (each PO is tied to the chat user)
- Look up or modify POs belonging to other employees
- Promise a delivery date, supplier, or shipping timeline
- Bypass policy tiers ("this time only") — tier routing is always enforced
- Place orders with suppliers directly (PO is the contract; the procurement team places orders)
- Accept free-text supplier names for non-catalogue items without escalation
- Use general knowledge — catalogue lookups come from the SharePoint List connector, policy comes from uploaded knowledge files in Copilot Studio, PO state from Dataverse

## Success Criteria

- 80% of catalogue requests completed (request submitted, approval card sent) within 3 minutes of the user opening the chat
- Line managers receive the adaptive card within 30 seconds of PO creation
- Zero POs created without a valid cost centre, requester email, and policy tier
- Users cannot view, edit, cancel, or approve POs they do not own
- Non-catalogue requests correctly escalate to `#procurement-exceptions` 100% of the time
- Average end-to-end time from request to approved PO drops from 5 days to under 24 hours

## Systems and Tools

- **Channel:** Microsoft Teams (agent published to Teams)
- **Authentication:** Microsoft Entra ID (user authentication)
- **Catalogue:** SharePoint list `ApprovedCatalogue` — exposed as a SharePoint List connector action (Get items with `$filter`) for structured lookup. Prefer list actions over generative answers for deterministic price/part-number results.
- **Policy knowledge:** `procurement-policy.md` and `restricted-items.md` uploaded directly to Copilot Studio as the agent's knowledge source (no SharePoint document library dependency)
- **PO store:** Dataverse — `cr85a_purchaseorder` table via **Dataverse MCP Server** (owned by the parent — this is a single-agent design, so the constraint is trivially satisfied)
- **Approval routing:** Power Automate flow (scaffolded from CPS, authored in the Power Automate portal) — sends Teams adaptive card, updates PO status on response
- **Escalation:** Microsoft Teams — Post message to `#procurement-exceptions` channel

## Platform Considerations

- **Single-agent design confirmed.** Tool count is ~8–12, comfortably under the 25–30 practical limit. No benefit from splitting.
- **Dataverse choice columns require integer values.** Status, Policy Tier, and any other choice fields must be passed as integers (e.g. `100000000`) in the MCP tool description and agent instructions. Text labels cause `FormatException` with no useful error detail.
- **Use "Get my profile (V2)"** for current-user lookup. "Get user profile (V2)" requires a UPN input and will trigger unwanted user prompting.
- **Power Automate flow identity — security-sensitive.** The approval-routing flow runs as the flow author (maker). The adaptive card to the line manager, the PO status update, and the audit trail will all reflect the maker identity, not the approving manager. **Required mitigations:**
  - Configure per-connection invoker identity on the Teams connector inside the flow so the adaptive card is sent in context of the correct manager
  - Use a dedicated service account as the flow maker (not a personal account), apply least privilege, and document it
  - For the PO status update step, pass the approver's UPN as an explicit field written to Dataverse so the audit trail captures the human approver independently of the flow's maker identity
- **"Update a row" multi-table binding.** If the design later grows to update multiple tables in one conversation, use pre-bound update actions per table — the generic action binds to the first table's schema.
- **User ownership checks must be enforced in MCP queries.** When reading / updating / deleting a PO, always scope the filter by the authenticated user's email. Never trust a PO number alone.
- **10-turn history limit.** Store the in-progress PO draft (selected item, quantity, cost centre) in agent variables — do not rely on conversation history for state.
- **Content moderation:** set in the portal (manual step).

## Tone and Behaviour

- Friendly and efficient — respect that the user wants to get back to work
- Use the employee's first name
- Always show costs in the user's configured currency (default GBP)
- If the catalogue has no match: "I couldn't find that in the approved catalogue. I'll pass this to the Procurement team — they'll reach out within 1 business day." (do not offer to source it yourself)
- Never fabricate prices, part numbers, or lead times

## Language and Compliance

- English only
- All PO creation, updates, and approvals logged in Dataverse with full audit trail (minimum 7 years for financial audit)
- Content moderation: Medium
- General knowledge: disabled. Web browsing: disabled.
- Role-based restrictions (e.g., dev tool categories) enforced by checking user department from Entra profile, not by asking the user.

## Sample Interactions

**1. Standard catalogue request**

> User: I need a second monitor for my home office.
> Agent: [looks up catalogue] "I found 3 approved monitors — please pick one:" [adaptive card with Dell P2723DE £280, LG 27UP550 £320, Samsung S27A600 £240]
> User: [taps Dell]
> Agent: "Quantity 1, delivery to your London office address, cost centre ENG-042. Confirm?"
> User: Confirm.
> Agent: "Done — PO-2841 created. Your manager Alice Chen has been notified in Teams. Most approvals come back within 24 hours."

**2. Over-threshold request**

> User: I need a £4,000 workstation for ML training.
> Agent: "That's above the standard catalogue threshold, so it goes to the Procurement team. I've posted the request to `#procurement-exceptions` with your justification — they'll be in touch within 1 business day. Is there anything else?"

**3. Status check**

> User: What's the status of PO-2841?
> Agent: [Dataverse MCP lookup scoped to user email, returns integer status code, agent renders as label] "PO-2841 is `Awaiting Manager Approval` — sent to Alice Chen 2 hours ago."
