# CPS Platform Constraints

## Orchestration
- Generative orchestration: English-only
- Conversation history: last 10 turns visible to the orchestrator. Earlier context is dropped.
- Tool limit: 128 hard max, 25-30 recommended. Beyond 30, routing quality degrades — agent ignores instructions, misroutes, makes unnecessary calls.
- When switching from classic to generative: Conversational Boosting system topic is bypassed. Custom data sources, Bing Custom Search in that topic — all ignored.
- Multiple Topics Matched system topic does not fire in generative mode.
- Auto-generated topic descriptions (from trigger phrases) are adequate but should always be reviewed.

## Knowledge Sources
- Max 500 knowledge objects per agent.
- 1,000 files, 50 folders, 10 layers of subfolders per source.
- Beyond 25 knowledge sources, orchestrator uses internal GPT to filter which to search — based on descriptions.
- Uploaded files are NOT part of the 25-source search limit.
- Without M365 Copilot license in tenant: SharePoint files limited to 7 MB (silently ignored above this).
- Indexing delay: 5-30 minutes after enabling unstructured data.
- Zero control over chunking — Dataverse applies undocumented defaults.
- No control over query type (keyword/vector/hybrid), reranking, or metadata filters.
- Citations from knowledge sources cannot be used as inputs to other tools.
- Generative orchestration does not support custom data or Bing Custom Search as knowledge sources — embed in a generative answers node in a topic instead.

## SharePoint Specifics
- Only modern pages supported. Classic ASPX pages ignored.
- Accordion nav menus and custom CSS break retrieval.
- "&" in document/folder names not supported.
- Lists with >12 lookup columns in default view not supported.
- Generative answers from SharePoint not available to guest users in SSO-enabled apps.
- Tenant graph grounding with semantic search requires M365 Copilot license + "Authenticate with Microsoft" auth.

## Multi-Agent
- No circular dependencies (A→B→A blocked).
- No multi-level chaining (parent→child→child's child blocked). Flatten hierarchy.
- Connected agent responses are always summarised by the parent orchestrator — by design, for security.
- Citations/links stripped in parent-child handoffs.
- MCP tools fail when child agent is called via parent orchestration.
- Child agents have separate tool limits from the parent (benefit of using them).

## Flows and Connectors
- Cloud flow timeout: 100 seconds. Place post-response logic after "Return value(s) to Copilot Studio" step.
- Connector payload limit: 5 MB public cloud, 450 KB GCC.
- Direct Line message size: 262,144 bytes (includes all context variables).
- Omnichannel ACS limit: 28 KB. Variables silently dropped if exceeded.

## Rate Limits
- Generative AI requests throttled per Dataverse environment (RPM and RPH).
- Accumulated conversation history can cause per-user token limit hits while other users are fine.
- OpenAIMaxTokenLengthExceeded error hidden in Activity Map — switch to Transcript view.

## Agent Instructions
- No documented character limit, but >~2000 chars causes latency, timeouts, degraded routing.
- Temperature control only available in prompt actions, not at agent level.
- Content filtering: no logging, no reason code, no diagnostic info when triggered.
