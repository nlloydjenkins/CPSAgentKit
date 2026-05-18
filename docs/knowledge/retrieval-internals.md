# CPS Retrieval Internals

## What Makers Can and Cannot Control

This page consolidates what is known about Copilot Studio's internal retrieval mechanics. Many of these properties are not exposed to makers but affect output quality directly. Understanding what cannot be changed helps avoid wasted optimisation effort and points to what can actually be influenced.

### Hard constraints (not configurable by makers)

| Property | Status | Notes |
|---|---|---|
| Chunk size | Not configurable | Dataverse applies undocumented defaults on upload |
| Chunk overlap | Not configurable | No maker control |
| Chunking strategy | Not configurable | Not paragraph/section/fixed-size selectable |
| Retrieval algorithm | Not configurable | Cannot choose keyword vs vector vs hybrid |
| Reranker | Not configurable | No reranker config exposed |
| Metadata filtering | Not configurable | Cannot filter retrieved chunks by metadata field |
| Top-K (number of chunks returned) | Not configurable | See Top-K section below |
| Query reformulation | Not configurable | Orchestrator reformulates internally; not inspectable |

### Configurable by makers (indirect influence)

| Lever | How it helps |
|---|---|
| Knowledge source descriptions | Source-selection at scale (>25 sources) is driven by descriptions — write them precisely |
| Document structure (headings, single-topic files) | Affects what ends up in a chunk; well-structured docs produce better chunks |
| Agent instructions (dual-placement) | Critical rules in instructions are always in context regardless of retrieval outcome |
| Ungrounded responses toggle | When off, forces responses to be grounded in retrieved content; suppresses model prior bleed |
| Content moderation level | Low/Medium/High threshold; configurable at agent, topic-node, and prompt-tool level |
| Model choice | Different models have different instruction-following and grounding behaviour |
| Knowledge source type | Different source types have different indexing stacks (see knowledge-sources.md) |

---

## Top-K: What Is Known

**Top-K** is the number of retrieved content chunks the orchestrator considers when synthesising a response.

### Copilot Studio (generative orchestration)

- A widely cited community figure is **top-3 chunks per source**. This is not confirmed as an explicit guaranteed value in current official Microsoft Learn documentation (as of May 2026).
- Official docs describe the orchestration selecting knowledge/tools/topics and summarising returned results, but do not publish a fixed K value.
- Treat **top-3 as the current working assumption** for planning purposes. It is consistent with field observations and has not been contradicted in official pages reviewed to date.
- Practical implication: if a question requires synthesising across more than ~3 content chunks, retrieval may miss relevant material. Design documents to be self-contained at the chunk level.

### Agent Builder / Declarative Agents (M365 Copilot)

- No fixed published top-K equivalent has been found in official Microsoft documentation for declarative agents.
- Retrieval fan-out is orchestrator-controlled; no maker-facing configuration is exposed.
- Treat as an **open question** pending explicit Microsoft documentation or product team confirmation.

### Why top-K matters for design

- Short, focused documents are more likely to have the relevant answer within the retrieved chunk window.
- Long documents with mixed topics may have the relevant section outside the retrieved chunks.
- Dual-placement (key rules in instructions AND in knowledge) is a direct mitigation for top-K constraints — instructions are always in context regardless of what the retrieval layer returns.

---

## Source-Selection at Scale (>25 Knowledge Sources)

When an agent has more than 25 knowledge sources, the orchestrator uses an **internal GPT to filter which sources to search** before running retrieval. This GPT selects sources based on their descriptions.

- Uploaded files are **not counted** toward the 25-source limit and are always included in retrieval.
- At 26+ sources, a poorly written description effectively makes a knowledge source invisible to the orchestrator for most queries.
- Source descriptions become the primary routing signal at scale — write them with the same care as tool descriptions.

See `knowledge-sources.md → Knowledge Source Descriptions` for guidance on writing effective descriptions.

---

## Retrieval Non-Determinism

CPS retrieval is non-deterministic. Identical queries can return different results depending on:

- Indexing state at query time (recent uploads may not be fully indexed)
- User permission context (SharePoint knowledge access is user-scoped)
- Orchestration context (conversation history, current topic)
- Concurrent environment load

**Implication:** do not design mission-critical agent behaviour to depend entirely on retrieval. Use dual-placement for critical rules. Evaluate retrieval quality with representative query sets, not single-instance tests.

---

## Indexing Delays

| Source type | Typical indexing delay |
|---|---|
| Uploaded files (Dataverse) | 5–30 minutes after upload |
| SharePoint (unstructured/files) | 4–6 hours after content change |
| SharePoint (website URL, modern pages) | Near real-time via Graph |
| OneDrive files/folders | 4–6 hours |
| Salesforce / Confluence / ServiceNow / ZenDesk | 4–6 hours |

**Status indicator caveat:** after adding an unstructured file/folder source, status may show "Ready" immediately, then change to "In Progress". Content is not actually usable until status returns to "Ready" a second time.

---

## What Cannot Be Diagnosed

When retrieval fails silently, the following diagnostic information is **not available** to makers:

- Which chunks were retrieved for a given query
- Why a source was or was not selected by the orchestrator
- Whether content filtering blocked a response and on what grounds
- Whether an indexing lag caused a retrieval miss

The Activity Map in Copilot Studio shows which knowledge source node was invoked, but not the retrieved chunk content or ranking. For deep retrieval debugging, the practical options are:

1. Ask a narrow test question that should uniquely match one document and observe whether the agent cites or uses it.
2. Check indexing status and re-test after the expected delay window.
3. Simplify the document structure and re-upload to force re-chunking.
4. Use echo `SendActivity` nodes between pipeline stages to surface intermediate outputs during development (remove before release).
