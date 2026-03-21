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

## When to Use Each Source Type

**SharePoint (with Tenant Graph Grounding):** best retrieval quality. Requires M365 Copilot license + "Authenticate with Microsoft." Supports files up to 200 MB. Use for primary knowledge.

**Uploaded files:** simple, no auth needed. Good for static reference docs. Not part of the 25-source search limit.

**SharePoint lists:** real-time connection to tabular data. Max 15 lists at a time. No more than 12 lookup columns in default view.

**Connectors (Dataverse, ServiceNow, Salesforce, etc.):** for enterprise system data. Requires user-level auth. Data ingested into Dataverse and indexed.

**Websites:** Bing-powered. Must confirm org ownership. Only works with generative orchestration web search setting.

## Common Failures

- Documents recently added/changed may not be indexed yet (5-30 min delay)
- Moved/deleted/renamed files cause stale results temporarily
- Knowledge accessible to maker but not end user → works in test, fails in production
- Declarative agents fail silently without M365 Copilot license (generic "Sorry" message)
- Azure AI Search connector: indexes must be vectorised, payloads can exceed CPS limits, no metadata filtering
