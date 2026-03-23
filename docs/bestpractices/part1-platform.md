# Copilot Studio Assessment Guide — Part 1: Platform (Quotas, Limits & Boundaries)

Everything that constrains what your agent can do before you even start building it.

---

## Rate Limits (Per Dataverse Environment)

These are the throttle points that will bite you in production. They apply per Dataverse environment, not per agent.

**General messages to an agent:** 8,000 requests per minute (RPM). This includes any message from a user or integration (Azure Bot Framework skills, etc.) to a single agent.

**Generative AI messages** (generative orchestration, agent actions, AI Tools, agent flow actions, generative answers) scale with your billing tier:

- **Trial/developer environments:** 10 RPM / 200 RPH — this is very low and will cause failures during any meaningful load testing.
- **1–10 prepaid message packs:** 50 RPM / 1,000 RPH
- **11–50 prepaid packs:** 80 RPM / 1,600 RPH
- **51–150 prepaid packs:** 100 RPM / 2,000 RPH
- **Above 150 packs:** +1 RPM / +20 RPH for each additional 10 packs
- **Pay-as-you-go:** 100 RPM / 2,000 RPH
- **M365 Copilot users:** 100 RPM / 2,000 RPH

Once the quota is met, the user sees a failure notice. There's no graceful degradation — the agent simply stops responding. You can request a rate-limit increase through Microsoft Support, but approval isn't guaranteed.

**Real-world impact:** Multiple community reports confirm that even 5–10 daily active users can trigger rate limits, particularly on environments with lower billing tiers. If you're seeing intermittent "AI Model Provider usage limit is reached" errors, this is almost certainly the cause.

---

## Agent Authoring Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Instructions field | 8,000 characters | This is the single most important config for agent behaviour — and you're capped at roughly 1,500 words |
| Topics per agent | 1,000 (Dataverse environments) | 250 in Dataverse for Teams environments |
| Trigger phrases per topic | 200 | Relevant for classic orchestration only; generative orchestration uses descriptions instead |
| Skills per agent | 100 | |
| Connector payload | 450 KB (GCC) / 5 MB (public cloud) | The GCC limit is dramatically lower — verify which cloud you're on |
| File upload size | 512 MB | Per individual file |
| File knowledge sources | 500 files max | Does NOT apply to SharePoint as a knowledge source |
| Agents per team (Teams app) | 50 | |

---

## SharePoint Knowledge Source Constraints

SharePoint is the most common knowledge source, and has the most constraints. Know these before you promise anything to a customer.

**File type support:** Only DOC/DOCX, PPT/PPTX, and PDF. No Excel for analytical queries (agents can't write and run code). No images, no plain text files, no HTML.

**File size:**
- With M365 Copilot licence + Tenant Graph Grounding enabled: up to 200 MB per file
- Without M365 Copilot licence: 7 MB max. Files over 7 MB are silently ignored — no error, just no answers. Split large files into smaller ones.

**Page type support:** Only modern SharePoint pages. Classic ASPX pages are silently ignored. Modern pages containing SPFx components are also not supported.

**Things that silently break or don't work:**
- SharePoint sites with accordion navigation menus or custom CSS — content isn't used for answers
- Queries that reference a specific file name (e.g. "What does document-x.pdf say about...") — cannot be answered
- The ampersand "&" symbol in document or folder names — not supported
- Document libraries as lists — not supported
- SharePoint list views — cannot be selected as a knowledge source
- Lists with more than 12 lookup columns in the default view — not supported
- Glossaries and synonyms for lists — not supported
- Guest users in SSO-enabled apps — generative answers from SharePoint aren't available
- Sensitivity-labelled documents (confidential/highly confidential) or password-protected files — show as "Ready" but never provide responses

**SharePoint list limits:** Queries only return data from the first 2,048 rows. The Attachments column doesn't index or reason over attachments (no error, just no responses from attachment content). Maximum 15 lists can be selected per "Add Knowledge" session.

**Sync frequency:** 4–6 hours from the time of ingestion completion. Content changes in SharePoint are not reflected in agent responses immediately.

---

## Unstructured Data Knowledge Source Limits

All unstructured data sources (OneDrive, SharePoint files/folders, Salesforce, Confluence, ServiceNow, ZenDesk) share these constraints:

- **Authentication:** All require user-level authentication at runtime. Single credential sign-in is not supported. Users must sign in before accessing data sources.
- **Sync frequency:** 4–6 hours across all source types.
- **ALM:** Application Lifecycle Management is NOT supported for any unstructured knowledge source. Importing agents doesn't result in automated knowledge source processing. You must manually re-process knowledge after solution import.
- **Glossaries/Synonyms:** Not supported for any source except Dataverse tables.
- **Status indicator is misleading:** After adding files/folders, status may show "Ready" immediately, then change to "In Progress". Content isn't actually usable until status returns to "Ready" a second time.

**OneDrive/SharePoint files and folders:** Max 1,000 files, 50 folders, 10 layers of subfolders per source. 512 MB per file. Supported types: doc, docx, xls, xlsx, ppt, pptx, pdf.

**Salesforce/Confluence:** No limit on number or size of articles.

**ServiceNow/ZenDesk:** No limit on number or size of articles.

**Dataverse:** Max 2 Dataverse sources per agent, max 15 tables per source. Only Standard or Activity table types (plus Virtual tables with specific dataproviderid). Maker must have READ permissions. Synonyms and glossaries ARE supported here (max 100 chars for name, 1,000 for description).

---

## Channel and Message Size Limits

**ACS channel (Omnichannel):** 28 KB message size limit. This affects handoff scenarios where all conversation variables (local + agent variables) are passed as context. If total variable size exceeds 28 KB, the transfer completes but variables are not passed. No error in the conversation — you just lose context silently.

**Direct Line / Facebook:** 262,144 bytes (256 KB) content length limit. This is imposed by the channel, not Copilot Studio. Options: provide links instead of inline content, or reduce variable payload sizes.

**Teams publishing:** Publishing an agent to Teams does NOT automatically update it for end users. Users can end up running different versions of the agent simultaneously. There is no built-in version management for the Teams channel.

---

## Power Platform Request Limits

| Plan | Limit |
|------|-------|
| Standard subscription | 250,000 requests per 24 hours (can be increased via Chat Session add-on) |
| Teams (M365 subscriptions) | 6,000 requests per 24 hours |

Teams plan also enforces a service limit of 10 sessions per user every 24 hours across all agents in a tenant. These sessions are not pooled.

---

## Subscription and Session Limits

**Copilot Credits:** The unit of billing since September 2025 (replaced messages). Credits are consumed based on the complexity of the task the agent performs, not on a fixed per-message basis. Credits do NOT roll over month-to-month. If you exceed purchased capacity, technical enforcement (service denial) applies.

**M365 Copilot licensed users:** Interactive usage of agents published to Copilot Chat, Teams, or SharePoint is included — no additional credit cost. However, autonomous/scheduled runs (Power Automate triggers, background processes) always consume credits regardless of user licensing.

**Testing credits:** Messages in the embedded test chat within Copilot Studio do NOT count toward billed sessions. However, prompts and models in agent flows DO consume credits even when triggered from the test panel or flow designer. Testing a prompt within the prompt builder itself is free.

**Proactive greetings:** A proactive greeting where the agent initiates a message counts as a billed Copilot Credit even if the end user never responds.

**Teams-native vs. standalone agents:** Agents created within the Teams environment using Copilot Studio for Teams don't consume credits. Agents created in standalone Copilot Studio and deployed to Teams DO consume credits for unlicensed users.

---

## Network Requirements

Copilot Studio requires connectivity to several domains. If any are blocked, agents will fail in unpredictable ways. The critical ones are:

- `*.directline.botframework.com` (HTTPS + WebSocket) — Bot Framework Web Chat
- `*.powerva.microsoft.com` (HTTPS) — Copilot Studio authoring and APIs
- `*.analysis.windows.net` (HTTPS) — Analytics via Power BI
- `token.botframework.com` (HTTPS) — Required only for manual authentication (OAuth flow)
- `bot-framework.azureedge.net` (HTTPS) — Bot framework resources
- `cci-prod-botdesigner.azureedge.net` (HTTPS) — Authoring experience

Also configure all required services for Power Automate if using flows with your agents.
