# CPS Knowledge Source Design

## How Retrieval Works

- Classic mode: Conversational Boosting system topic searches knowledge. Limited by source type.
- Generative mode: orchestrator searches all agent-level knowledge sources. If >25 sources, uses internal GPT to filter based on descriptions.
- Generative mode bypasses Conversational Boosting customisations entirely.

## Chunking

You have zero control. Dataverse applies undocumented default chunking on upload. Cannot control:

- Chunk size
- Chunk overlap
- Chunking strategy (by paragraph, by section, fixed-size, etc.)

This is the #1 limitation for production RAG quality. For critical use cases, consider a custom ingestion pipeline with Azure AI Search as a custom knowledge source.

## Knowledge Source Descriptions

Descriptions become critical at scale. Write them like tool descriptions:

- What domain/topic the source covers
- What type of content it contains
- Who/what it's relevant for
- What it does NOT cover

Good: "UK employee benefits handbook. Covers health, dental, vision, retirement for UK employees and dependents. Updated quarterly. Do not use for US or EU benefits."

Bad: "Benefits."

## Structuring for Retrieval

- Keep documents focused on a single topic/domain
- Split large documents into smaller, topic-specific files
- Without M365 Copilot license: keep SharePoint files under 7 MB
- Avoid mixing unrelated content in one document — the chunker doesn't know where topics change
- Use clear headings and structure — helps both chunking and retrieval

## Dual-Placement for Critical Frameworks

If the agent must follow a strict framework, scoring methodology, or procedural checklist, put the full version in knowledge files and also summarise the key rules in agent instructions. CPS retrieval is not deterministic enough to rely on knowledge alone for mission-critical behavior. The instruction summary ensures the framework is always in context; the knowledge source provides the detailed reference when retrieved.

### Content-Type Separation

Production experience reveals a more nuanced pattern than simple duplication. Separate content by type:

- **Domain rules** that the agent must apply (criteria, style rules, regulatory references, scoring thresholds) → **agent instructions**. These must always be in context and are typically sourced from authoritative systems (design systems, regulatory frameworks, brand guidelines).
- **Assessment methodology** that tells the agent how to apply those rules (output templates, worked examples, scoring procedures, arithmetic verification steps) → **knowledge files**. These are longer, only needed during execution, and reduce instruction length.

This separation keeps instructions focused on what to assess while knowledge files handle how to format and calculate. It also creates a clean update path: rules change when standards change; methodology changes when output quality needs improvement.

## MCP Servers as Live Knowledge Sources

MCP servers can be used as live knowledge pipelines — the orchestrator fetches current guidelines, rules, or reference data at the start of each execution and passes the results to child agents as context.

### Pattern: Live Fetch + Static Fallback

1. The orchestrator owns the MCP tool (MCP is more reliable on the parent than inside child-agent orchestration).
2. At the start of each workflow, the orchestrator calls the MCP server to fetch the latest authoritative content (e.g., brand guidelines from a design system, regulatory rules from a compliance API).
3. The fetched content is passed to each specialist child as context, prefaced with: "The following are the latest [X] guidelines fetched from [source]. Use these as the authoritative source for your review."
4. Agent instructions contain static fallback copies of the same content for resilience. If the MCP server is unavailable, the agent proceeds with the static version.
5. The final output metadata reports fetch status: "Guidelines fetched successfully at [time]" or "Static fallback used — live guidelines unavailable."

This pattern ensures agents always have the latest authoritative content when available, with graceful degradation when the external source is down.

## When to Use Each Source Type

**SharePoint (with Tenant Graph Grounding):** best retrieval quality. Requires M365 Copilot license + "Authenticate with Microsoft." Supports files up to 200 MB (Microsoft docs also cite 512 MB for PDF/PPTX/DOCX in some scenarios — validate large files in your target tenant). Use for primary knowledge.

**Uploaded files:** simple, no auth needed. Good for static reference docs. Not part of the 25-source search limit.

**SharePoint lists:** real-time connection to tabular data. Max 15 lists at a time. No more than 12 lookup columns in default view.

**Connectors (Dataverse, ServiceNow, Salesforce, etc.):** for enterprise system data. Requires user-level auth. Data ingested into Dataverse and indexed.

**Websites:** Bing-powered. Must confirm org ownership. Only works with generative orchestration web search setting.

## Additional Source Types

### Knowledge-Base Connectors (Confluence, Salesforce, ServiceNow, Zendesk)

Added at **collection level** — you cannot pick individual articles or files. Only **published** articles are used; drafts and archived content are not. Permission-aware: the agent validates end-user permissions before answering.

**Gotcha:** the maker connection is used to create/configure the source, but those credentials are not reused for end users after publishing. Users must sign in with their own credentials.

Use when the source is an existing article collection and published articles are the source of truth. Avoid when you need draft/archived content or individual-article selection.

### Real-Time Power Platform Connectors

**Preview** capability. Copilot Studio indexes **metadata** such as table and column names, but data remains in the source system and is queried at runtime using the user's token. Expect different latency, troubleshooting and security behaviour from indexed knowledge.

Use when data must remain in the source system, runtime freshness matters, and the source can be queried with the user's token. Avoid when preview features are not acceptable, low latency is critical, or the source cannot handle runtime query load.

### MCP Servers as Knowledge

MCP is an **extension mechanism**, not just another static knowledge source. An MCP server can expose resources, tools and prompts. Resources behave like readable context; tools behave like callable functions. **Requires generative orchestration.**

Use when the agent needs runtime access to a system, when the external system can expose resources/tools cleanly, when the source should not be indexed into Microsoft 365, or when live data/actions are needed.

Avoid when static indexed Q&A is enough, when runtime dependency risk is unacceptable, when authentication / latency / availability cannot be governed, or when the MCP server may expose prompt-injection-prone content without controls. **Treat MCP sources as runtime dependencies with latency, availability, authentication and prompt-injection risks.**

See the "MCP Servers as Live Knowledge Sources" section above for the live-fetch-plus-static-fallback orchestration pattern.

### File Groups (locally uploaded files only)

When multiple locally uploaded files belong to one logical knowledge set, group them into a **file group**. Each file group has its own name, description and instructions.

```text
- File groups support locally uploaded files only.
- OneDrive and SharePoint files are NOT supported in file groups.
- Use the group instructions to tell the agent how to choose between files in the group.
- File groups reduce source-selection ambiguity by turning several files into
  one logical knowledge source.
```

Good uses: region-specific policy packs, role-specific guidance, product-family documentation, persona examples grouped by audience, rubric packs (criteria + examples + scoring guidance).

## Critical Gotcha: Markdown / JSON / TXT in SharePoint Libraries

Markdown, JSON, YAML and plain text are supported on the **uploaded-files** path (stored and indexed in Dataverse). They are **not** reliably retrieved or citable when the same files live in a **SharePoint** document library and are added as SharePoint knowledge.

SharePoint knowledge **only generates answers from DOC/DOCX, PPT/PPTX and PDF** on **modern** pages. Classic ASPX content and SPFx-component pages are not used. Markdown, JSON, TXT and other non-Office formats in a SharePoint library are effectively invisible to SharePoint knowledge.

**Ship `.md` / `.json` / `.yaml` knowledge packs through the uploaded-files path, not SharePoint.** If the pack must live in SharePoint for governance reasons, convert to PDF or DOCX first.

## Citation Clickability Gotcha (Uploaded Files)

Files embedded directly into an agent (uploaded during build) are stored as internal content and used for answering, but they are **not hosted** — their citation links can be **non-clickable** after publishing. SharePoint, Dataverse and connector-backed sources produce resolvable citation links; locally uploaded `.md` / `.json` may not.

If clickable provenance is a requirement, host the content in SharePoint / Dataverse / a connector rather than as locally uploaded files. Also note: citations returned from a knowledge source **cannot currently be passed as inputs to other tools or actions**.

## SharePoint Source Paths — Two Distinct Behaviours

Copilot Studio exposes two different SharePoint knowledge paths with fundamentally different runtime behaviour. Confusing them is a common cause of inconsistent retrieval quality.

|                          | SharePoint URL (website/page path)                         | SharePoint unstructured (files/folders)                          |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| **How added**            | Add Knowledge → Website URL → SharePoint site/page URL     | Add Knowledge → SharePoint/OneDrive → select files or folders    |
| **Runtime mechanism**    | SharePoint search stack (near real-time via Graph)         | File contents copied into Dataverse, indexed there               |
| **Freshness**            | Near real-time — edits to modern pages reflect quickly     | 4–6 hour sync delay. Content changes not visible until next sync |
| **Content type**         | Modern SharePoint pages and wikis                          | Document libraries: DOCX, PDF, PPTX, XLSX, etc.                  |
| **File size limit**      | 7 MB per file without M365 Copilot license                 | 512 MB per file; 1,000 files / 50 folders max                    |
| **M365 Copilot license** | Required for files >7 MB and Tenant Graph Grounding        | Required for Tenant Graph Grounding quality lift                 |
| **Retrieval quality**    | Improved by Tenant Graph Grounding with semantic search    | Improved by Tenant Graph Grounding; without it, keyword-only     |
| **ALM support**          | Not supported — manual re-processing after solution import | Not supported                                                    |

**Design implication:** if a team adds a SharePoint file library via the URL path expecting document-level retrieval, they get page-based retrieval with different freshness and filtering behaviour. Always confirm which path is in use when diagnosing inconsistent results.

## Uploaded File Format Support

The following formats are supported for directly uploaded files (Add Knowledge → Files). Formats marked ✓ are confirmed in official Microsoft Learn documentation (2025). Support is independent of retrieval quality — supported does not mean optimal for RAG.

| Format     | Extension(s) | Retrieval notes                                                                  |
| ---------- | ------------ | -------------------------------------------------------------------------------- |
| Word       | .docx, .doc  | Good. Well-structured docs retrieve well.                                        |
| PDF        | .pdf         | Good. Text-based PDFs preferred; scanned/image PDFs retrieve poorly.             |
| PowerPoint | .pptx, .ppt  | Good. Slide text extracted; embedded images/charts ignored.                      |
| Excel      | .xlsx, .xls  | Supported but poor for analytical Q&A — agents cannot run code against the data. |
| Markdown   | .md          | Supported. Structure preserved; useful for curated knowledge.                    |
| Plain text | .txt         | Supported. No structural benefits from headings.                                 |
| JSON       | .json        | Supported. Flat key-value data ingested as text.                                 |
| YAML       | .yaml, .yml  | Supported. Ingested as text.                                                     |
| CSV        | .csv         | Supported. Rows ingested as text; no aggregation/query capability.               |
| XML        | .xml         | Supported.                                                                       |
| LaTeX      | .tex         | Supported.                                                                       |

**Safest for retrieval quality:** DOCX → PDF (text-based) → PPTX → MD. Avoid relying on XLSX for anything requiring numerical reasoning — the agent cannot execute queries against spreadsheet data.

**File size limit for uploads:** no published per-file cap in official docs for uploaded files (distinct from SharePoint's 7 MB / 512 MB limits). If an upload silently fails to index, split the file.

## Graph Connectors vs SharePoint Knowledge

Graph Connectors are a separate path for surfacing non-SharePoint enterprise content (e.g. ServiceNow, Confluence, Jira, custom databases) into the Microsoft Search semantic index, which Copilot Studio can then query via Tenant Graph Grounding.

### When to use Graph Connectors

- Content lives outside SharePoint/OneDrive (ITSM, CRM, custom LOB systems).
- You need richer metadata schema and property-based filtering that SharePoint file libraries cannot provide.
- You want deterministic ingestion governance — control over what is indexed, when, and with what schema.
- Cross-system aggregation: users should get answers that span SharePoint and a non-SharePoint system in a single response.

### When to use SharePoint knowledge instead

- Content already lives in SharePoint or OneDrive.
- Permissions and semantic indexing are healthy and Tenant Graph Grounding is available.
- Setup simplicity matters — Graph Connectors require admin setup and a connector configuration.

### Known limits and caveats (validate against current Microsoft docs for exact figures)

- **Refresh cadence:** depends on connector type. Most built-in connectors support full crawl + incremental crawl schedules. Custom connectors (via Graph Connector API) can push items on demand but crawl schedules still apply for deletions.
- **Item limits:** published limits vary by connector. Microsoft Search has a per-connector item limit (in the millions for first-party connectors); custom connectors have lower published caps. Confirm against current Microsoft 365 licensing/limits documentation.
- **Schema constraints:** each connector defines a property schema. Copilot Studio retrieves content via semantic search over indexed properties — it cannot query arbitrary metadata fields not mapped in the connection schema.
- **M365 Copilot license required:** Graph Connector content is only surfaced to Copilot Studio when Tenant Graph Grounding is enabled, which requires M365 Copilot licensing.
- **Setup ownership:** Graph Connectors are configured by a Microsoft 365 admin, not a Copilot Studio maker. Build plans that depend on Graph Connectors must include an admin setup dependency.
- **No direct CPS-side controls:** once indexed, the maker has no control over chunking, reranking, or metadata filtering from within Copilot Studio.

**Recommendation:** use native SharePoint grounding first when content already lives in SharePoint and permissions/indexing are healthy. Add Graph Connectors when you need cross-system coverage or metadata governance that SharePoint alone cannot provide. For hard limits and refresh schema constraints, validate against current Microsoft 365 admin and Graph Connector documentation — these change with licensing tiers.

## Programmatic Uploaded-File Knowledge

Uploaded-file knowledge is a backend ingestion operation, not a local YAML generation feature. Local `.mcs.yml` knowledge descriptors are export mirrors created by Get Changes after Copilot Studio/Dataverse has accepted and processed the file. Creating descriptor YAML alone does not upload, process, or index the document.

The confirmed Dataverse shape uses the `botcomponent` table:

- `componenttype`: `14` (`Bot File Attachment`)
- `name`: uploaded file name, e.g. `vpn-setup.md`
- `description`: knowledge source description shown in CPS/exported YAML
- `schemaname`: unique file component schema name, e.g. `cr86a_ITHelpDesk.file.vpn-setup.md_Api8kk`
- `parentbotid`: parent agent lookup
- `parentbotcomponentid`: child agent lookup when the file belongs to a child agent
- `filedata`: Dataverse file column containing the uploaded document bytes
- `filedata_name`: uploaded file name captured by Dataverse

Product flow:

1. Read `<agentFolder>/.mcs/conn.json` for `DataverseEndpoint`, `EnvironmentId`, `AgentId`, `AccountInfo.TenantId`, and `AccountInfo.AccountEmail`.
2. Acquire a Dataverse token for `DataverseEndpoint` in `AccountInfo.TenantId`. A token from another tenant fails with `403 Forbidden: The user is not a member of the organization.` Treat this as an auth-context mismatch, not a file-upload or schema problem.
3. Resolve the parent agent id from `AgentId`.
4. If uploading to a child agent, resolve the child `botcomponentid` from `.mcs/botdefinition.json` or Dataverse `botcomponents` by matching the child agent schema/component.
5. Create a `botcomponent` row with `componenttype = 14`, `language = 1033`, `parentbotid@odata.bind`, and when child-owned, `ParentBotComponentId@odata.bind`.
6. Upload the raw bytes to `botcomponents(<id>)/filedata` with `Content-Type: application/octet-stream` and `x-ms-file-name: <fileName>`.
7. Verify `componenttype = 14`, `filedata` is non-null, `filedata_name` matches the file name, parent/child lookup values are correct, and `statecode = 0` / `statuscode = 1`.
8. Wait for Copilot Studio processing/indexing to show `Ready` in the portal or equivalent status.
9. Run Get Changes so local `knowledge/` descriptors reflect the uploaded source.
10. Test retrieval in the target agent and confirm Activity Map uses the uploaded knowledge.

Example create request body:

```json
{
  "name": "vpn-setup.md",
  "description": "This knowledge source searches information contained in vpn-setup.md",
  "schemaname": "cr86a_ITHelpDesk.file.vpn-setup.md_Api8kk",
  "componenttype": 14,
  "language": 1033,
  "parentbotid@odata.bind": "/bots(3a76e605-f446-f111-bec5-6045bd09c8e7)",
  "ParentBotComponentId@odata.bind": "/botcomponents(07e37dff-3644-435e-9c30-a1e55f544989)"
}
```

Important gotchas:

- `ParentBotComponentId@odata.bind` is case-sensitive and is not the same as the logical column name `parentbotcomponentid`. Using `parentbotcomponentid@odata.bind` produces an undeclared property error.
- The parent bind uses `parentbotid@odata.bind`.
- Generate a unique `schemaname` suffix and check for collisions before create.
- Single-request Dataverse file-column upload is suitable for small files under 128 MB. Larger files require Dataverse chunked file upload.
- Post-upload `Ready` means the file is accepted and indexed enough to appear in the portal, but product validation should still include a retrieval test in Activity Map.

Build implication: when uploaded files are listed in `Requirements/docs/` or architecture as knowledge to add, Build must use the backend ingestion path. If Build has an authenticated Dataverse/CPS Web API path aligned to the tenant in `.mcs/conn.json`, upload the files programmatically through `botcomponent` + `filedata`. If that auth path is unavailable, stop and classify the item as a manual portal upload. Never generate local knowledge YAML as a substitute for ingestion.

Product command target: Agent Workbench should expose backend upload as a first-class operation, for example `cps knowledge upload --agent "IT Help Desk" --child-agent "Knowledge Specialist" --file /path/to/article.md`. The command should read `.mcs/conn.json`, acquire a tenant-aligned Dataverse token, create the `botcomponent`, upload `filedata`, wait for Ready/processing, prompt for or run Get Changes, verify the mirrored descriptor, and require Activity Map retrieval testing.

## Uploaded-File Knowledge Descriptions Are Orchestrator Routing Inputs

For an agent with generative orchestration and `Allow general knowledge`, `Web search`, and `Allow ungrounded responses` all OFF, knowledge-source descriptions are the dominant routing lever even below the 25-source threshold. Beyond 25 sources, descriptions become a hard pre-filter — the internal source-selection GPT picks sources to search based on descriptions, so a source with a weak or placeholder description is effectively invisible at scale. Treat descriptions as routing inputs, not polish.

For uploaded-file knowledge, the description used by the orchestrator lives on the Dataverse `botcomponent.description` column. The portal's knowledge-source description text box binds to this column.

### Gotcha: the local mirror description is a placeholder

After Get Changes, `<agentFolder>/knowledge/files/<file>.mcs.yml` contains:

```yaml
mcs.metadata:
  componentName: vpn-setup.md
  description: This knowledge source searches information contained in vpn-setup.md
```

That `description` is a boilerplate placeholder, not the real `botcomponent.description`. The official Copilot Studio extension's Apply Changes does not push edits to this field back to Dataverse. So:

- Real descriptions live in Dataverse only; the local mirror does not round-trip them.
- Editing `mcs.metadata.description` in the YAML and running Apply Changes has no observable effect on the orchestrator.
- For source-controlled ALM of descriptions, keep the authoritative text outside the mirror — see the override pattern below.

### Setting the real description via the Dataverse Web API

Three requests per file:

1. `POST {org}/api/data/v9.2/botcomponents` to create the row with `componenttype = 14`, `parentbotid@odata.bind`, and a unique `schemaname`.
2. `PATCH {org}/api/data/v9.2/botcomponents(<id>)/filedata` with the raw bytes and `x-ms-file-name`.
3. `PATCH {org}/api/data/v9.2/botcomponents(<id>)` with `{ "description": "<real description>" }`.

Step 3 is the routing-correctness step that the portal does in the same screen as upload but the API splits into a separate request. Returns 204 No Content. The portal's knowledge-source description box reflects the new value immediately.

Auth: `az account get-access-token --resource https://<org>.crm.dynamics.com --tenant <tenantId>`. Tenant must match `.mcs/conn.json#AccountInfo.TenantId` or Dataverse returns 403 "The user is not a member of the organization."

### Agent Workbench override block for source-controlled descriptions

To keep descriptions reviewable in source control without colliding with the platform-generated mirror, add an explicit `cpsAgentKit.description` block at the top of the local mirror YAML:

```yaml
cpsAgentKit:
  description: >-
    VPN setup runbook covering split-tunnel, MFA enrolment, and macOS
    client install. Do not use for general networking questions.
mcs.metadata:
  componentName: vpn-setup.md
  description: This knowledge source searches information contained in vpn-setup.md
kind: KnowledgeSourceConfiguration
```

`cpsAgentKit.description` is the source of truth for the description. The `mcs.metadata.description` placeholder is left untouched so Get Changes and Apply Changes stay clean. Push the override to Dataverse via the MCP tool `cps_plan_knowledge_descriptions` (returns the GET/PATCH plan) and the bundled CLI helper `node scripts/push-knowledge-descriptions.mjs <agentFolder>` (executes against `az`-acquired tokens). Both refuse to PATCH placeholder text.

### Schema-name suffix for programmatic file creation

`schemaname` is required on create. The portal generates a 3-char random suffix automatically; the API does not. Use the form `<solutionPrefix>_<agentSchemaName>.file.<filename>_<suffix>` and choose a stable suffix the maker controls (e.g. `_a01`, `_a02`) rather than guessing the portal's pattern. The suffix is opaque to retrieval and to the orchestrator; the only constraint is uniqueness within the agent.

### Bulk workflow (until first-party tooling lands)

1. Confirm `<agentFolder>/.mcs/conn.json` is current and `az login` targets the tenant in `AccountInfo.TenantId`.
2. For each uploaded file, add or update the `cpsAgentKit.description` block at the top of `knowledge/files/<file>.mcs.yml` in a feature branch and review in PR.
3. Call MCP `cps_plan_knowledge_descriptions` (or run `node scripts/push-knowledge-descriptions.mjs <agentFolder> --dry-run`) to see the planned PATCHes.
4. Run `node scripts/push-knowledge-descriptions.mjs <agentFolder>` to PATCH the descriptions onto Dataverse. The helper skips placeholder mirrors and entries without a `cpsAgentKit.description` override.
5. Validate retrieval in Activity Map. Descriptions only affect routing, so retrieval changes show up as different sources being selected for the same question.

## Common Failures

- Documents recently added/changed may not be indexed yet (5-30 min delay)
- Moved/deleted/renamed files cause stale results temporarily
- Knowledge accessible to maker but not end user → works in test, fails in production
- Declarative agents fail silently without M365 Copilot license (generic "Sorry" message)
- Azure AI Search connector: indexes must be vectorised, payloads can exceed CPS limits, no metadata filtering
