# CxO Digital Twin and SME Agents - Research Brief

Date: 2026-05-12
Scope: Answers consolidated questions using this repository's docs only.

## Executive Summary

- Your core diagnosis is correct: standard M365 Copilot chat with directly uploaded files can place much more source content into active context, while Copilot Studio and declarative agents rely on retrieval and are therefore sensitive to retrieval miss/failure.
- In Copilot Studio, top-K is documented in your notes as 3 and aligns with the repo guidance pattern that retrieval is constrained and maker controls are limited.
- Maker controls over chunking, top-K, retrieval algorithm (keyword/vector/hybrid), reranking, and metadata filtering are not exposed in Copilot Studio.
- The biggest practical quality levers are: source structure, source descriptions, knowledge source design, and architecture (especially dual-placement + orchestrator-owned retrieval in multi-agent systems).
- For production scaling, do not rely on a monolithic knowledge pool. Use domain partitioning, high-quality source descriptions, and orchestrator-first retrieval patterns.

## 1) RAG Architecture and Core Mechanics

### 1.1 Are your mechanics accurate?

Mostly yes.

What repo docs confirm:

- Generative mode uses orchestrator-driven retrieval across agent-level knowledge sources.
- If there are more than 25 knowledge sources, an internal GPT first filters which sources to search based on source descriptions.
- Retrieval is non-deterministic enough that mission-critical behavior should not rely on knowledge retrieval alone.
- There is zero maker control over chunking and no maker control over retrieval internals like query mode/reranking/filtering.

Sources:
- docs/knowledge/knowledge-sources.md
- docs/knowledge/constraints.md
- docs/knowledge/anti-patterns.md

### 1.2 Which RAG path is Copilot Studio using? Can it be configured?

From your notes and repo guidance, the practical path is:

1. Query interpretation/planning by orchestrator
2. Retrieval over configured knowledge sources (with source-selection behavior changing at scale)
3. LLM synthesis grounded by retrieved material
4. Safety/moderation gating before final output

Maker influence is indirect, not hard-config:

- Knowledge source choice and quality
- Knowledge source descriptions (very important once source count grows)
- Agent instructions (including dual-placement summaries)
- Settings (e.g., ungrounded responses toggle, moderation level)
- Model choice

Not maker-configurable:

- Top-K knobs
- Chunk size/overlap policy
- Retrieval algorithm details
- Reranker config
- Metadata filter logic

Sources:
- docs/knowledge/knowledge-sources.md
- docs/knowledge/constraints.md
- docs/knowledge/prompt-engineering.md

### 1.3 Is Copilot Studio top-K = 3?

- Your provided response states top-3 for Copilot Studio.
- This repo does not add a contradictory value.

Conclusion: treat top-3 as the current working assumption for Copilot Studio.

### 1.4 Is there an equivalent published top-K for Agent Builder/declarative agents?

- Repo docs do not publish a fixed top-K for declarative agents.
- Practical guidance is to assume orchestrator-controlled retrieval with no exposed maker control.

Source:
- docs/knowledge/declarative-agents.md
- docs/knowledge/constraints.md

## 2) File Types, Content, and Ingestion

### 2.1 Does file type materially affect quality/hallucination?

Yes. Repeatedly confirmed in repo docs.

- Retrieval quality depends on indexability/extractability and document structure.
- Community/field guidance in repo says raw business docs usually need reformatting for acceptable retrieval quality.

Sources:
- docs/bestpractices/part3-agent-design.md
- docs/bestpractices/part5-gotchas-bugs.md
- docs/knowledge/knowledge-sources.md

### 2.2 Supported vs partial formats (from repo docs)

Important: repo docs describe support by source type, and some pages differ by wording/version.

SharePoint / OneDrive knowledge constraints found in docs:

- Strongly documented support set: doc, docx, ppt, pptx, pdf.
- Another section also lists xls/xlsx for OneDrive/SharePoint files/folders.
- There are known limitations for analytical quality on spreadsheet-based questions (even if ingestible).

Uploaded files in Copilot Studio:

- Repo examples include uploaded markdown file workflows and backend Dataverse file upload patterns.
- Explicit full extension matrix is not centralized in one authoritative repo file.

Practical interpretation:

- Treat doc/docx/ppt/pptx/pdf as safest.
- Treat xls/xlsx as potentially ingestible but not strong for analytical Q&A.
- Treat text/markdown as operationally used in this repo patterns for uploaded knowledge.

Sources:
- docs/bestpractices/part1-platform.md
- docs/bestpractices/part3-agent-design.md
- docs/knowledge/knowledge-sources.md

### 2.3 Known failure modes that raise hallucination risk

- SharePoint over 7 MB without M365 Copilot license: silently ignored.
- Classic ASPX pages ignored.
- Accordion navigation/custom CSS break retrieval.
- Ampersand in SharePoint names unsupported.
- Sensitivity-labeled/password-protected files may show Ready but not answer.
- Indexing delay and sync delay create stale/missing retrieval windows.

Sources:
- docs/knowledge/constraints.md
- docs/bestpractices/part1-platform.md
- docs/bestpractices/part5-gotchas-bugs.md

### 2.4 Chunking strategy guidance when controls are not exposed

- You cannot set chunk size/overlap.
- You can strongly influence outcome by structure:
  - Clear section headings
  - One topic per file
  - Split large mixed docs into focused files
  - Avoid dense unstructured content

Sources:
- docs/knowledge/knowledge-sources.md
- docs/bestpractices/part3-agent-design.md

### 2.5 Biggest lever for ~20 short/medium files

Priority order likely to move quality most:

1. Information architecture and structure (single-topic docs, heading quality)
2. Knowledge source descriptions (especially for source-selection behavior)
3. Source quality and text extractability (avoid OCR-heavy/complex PDFs)
4. Prompt/instruction dual-placement for critical rules
5. File format optimization

Source basis:
- docs/knowledge/knowledge-sources.md
- docs/knowledge/anti-patterns.md
- docs/bestpractices/part3-agent-design.md

## 3) Configuration, Settings, and Prompts

### 3.1 Content moderation level effect

- Moderation is portal-only setting with Low/Medium/High.
- Filtering is black-box with limited diagnostics.
- Higher moderation may block legitimate domain terms; Low is often required in specialist domains.

Interpretation: this behaves like safety gating, not deterministic grounding enforcement.

Sources:
- docs/knowledge/constraints.md
- docs/knowledge/cheat-sheet.md
- docs/use-cases/* examples

### 3.2 Allow ungrounded responses effect

- This is one of the strongest hallucination controls.
- Turning it off constrains responses to retrieved/grounded material and can suppress follow-up behavior that depends on general knowledge.

Source:
- docs/knowledge/prompt-engineering.md
- your provided response notes

### 3.3 Work IQ / Tenant Graph Grounding effect

- Repo docs discuss this as Tenant Graph Grounding with semantic search and describe a major quality lift for SharePoint retrieval.
- It requires M365 Copilot licensing and Microsoft-authenticated context.

Sources:
- docs/knowledge/knowledge-sources.md
- docs/knowledge/constraints.md
- docs/bestpractices/part3-agent-design.md

### 3.4 Hard constraints vs soft guidance

- Hard constraints: platform limits, licensing, source limits, unsupported formats/features, unavailable tuning knobs.
- Soft guidance: prompt wording, source descriptions, topic descriptions, instruction emphasis.

Source:
- docs/knowledge/constraints.md

### 3.5 Model choice (GPT-5 Chat vs Reasoning)

- Repo confirms model options are available and advises full re-evaluation after model changes.
- No fixed rule in repo says one model always hallucinates less; behavior is scenario dependent.

Source:
- docs/bestpractices/part1-platform.md

### 3.6 Does Markdown instruction format matter?

- Repo guidance consistently uses structured, explicit instruction writing.
- Practical interpretation: structured markdown (headings, bullets, explicit constraints) helps instruction adherence by improving parsing salience.

Sources:
- docs/knowledge/prompt-engineering.md
- docs/templates/content-review-multi-agent/*

### 3.7 Prioritizing internal over web sources

Most effective stack:

1. Turn off ungrounded responses (or equivalent general-knowledge behavior)
2. Remove unnecessary public website sources
3. Improve source descriptions to sharpen source-selection
4. Use instruction constraints that require citing internal sources
5. Use dual-placement for critical policy/rule fragments in instructions

Sources:
- docs/knowledge/knowledge-sources.md
- docs/knowledge/prompt-engineering.md
- docs/templates/content-review-multi-agent/overview.md

## 4) Why Sub-Agents Can Reduce Hallucinations

Likely mechanisms (supported by repo patterns):

- Narrower role scope per child agent reduces ambiguity.
- Orchestrator can own retrieval of standards and pass explicit context to children, reducing child-side retrieval variance.
- Critical criteria can be kept in orchestrator instructions + passed context, reducing dependence on child retrieval.

Caveat:

- Parent summarizes child outputs and may strip citations in handoff, so design for auditability in outputs.

Sources:
- docs/templates/content-review-multi-agent/overview.md
- docs/knowledge/multi-agent-patterns.md
- docs/bestpractices/part4-tools-multiagent.md

## 5) Scaling Pattern: POC to Production

### 5.1 Recommended general scaling pattern

1. Partition by domain: avoid giant mixed knowledge pools.
2. Keep each source tightly scoped and well described.
3. Keep critical policy/rule snippets in instructions (dual-placement).
4. Use orchestrator-first retrieval/context passing for specialist agents.
5. Add evaluation harnesses and regression checks for retrieval quality after content/model changes.

Sources:
- docs/knowledge/knowledge-sources.md
- docs/knowledge/anti-patterns.md
- docs/templates/content-review-multi-agent/overview.md

### 5.2 Dataverse upload vs SharePoint + Graph grounding vs custom knowledge

Decision framework:

- SharePoint + Tenant Graph Grounding: preferred for broad enterprise document corpora where permissions and semantic index quality are strong.
- Dataverse uploaded files: good for controlled, static curated corpora and explicit backend ingestion workflows.
- Custom knowledge source (e.g., Azure AI Search): preferred when you need explicit retrieval control, custom chunking, metadata filtering, or enterprise RAG governance.

Repo explicitly notes custom ingestion/search is the path when platform chunking/retrieval defaults become the quality bottleneck.

Source:
- docs/knowledge/knowledge-sources.md
- docs/bestpractices/part1-platform.md

### 5.3 Graph Connectors guidance

This repo has limited direct Graph Connector deep-detail coverage (item-count and schema limits are not deeply cataloged here).

Practical recommendation in this repo context:

- Use native SharePoint grounding first when content already lives in SharePoint and permissions/indexing are healthy.
- Consider connector/custom index strategies when you need cross-system aggregation, richer metadata control, or deterministic ingestion governance.
- For Graph Connector hard limits/refresh/schema constraints, capture as an open external dependency for Microsoft product documentation validation.

## Proposed Architecture for the CxO Digital Twin + SME Agents

### Objective

Create a CxO-facing digital twin that can answer strategic questions with high grounding confidence, while delegating deep domain responses to SME agents.

### Recommended Pattern

1. Parent CxO Orchestrator Agent
- Owns enterprise-level instructions, governance policy, and response contract.
- Performs initial intent routing and retrieves core standards/policies.
- Delegates domain-specific analysis to SME children.

2. SME Specialist Agents (Finance, Risk, Legal, HR, Ops, IT, etc.)
- Narrow role prompts and domain-specific knowledge boundaries.
- Consume orchestrator-provided context plus domain knowledge.
- Return structured outputs with confidence and source traces.

3. Knowledge Strategy
- Dual-placement for mission-critical policy/rules.
- Domain-specific source partitioning; avoid monolithic mixed corpora.
- High-quality source descriptions for each knowledge source.

4. Hallucination Controls
- Disable ungrounded responses for production pathways where possible.
- Prefer internal sources over web unless explicitly requested.
- Keep moderation level at the lowest safe setting for your domain vocabulary.

5. Scale and Operations
- Introduce retrieval/evaluation scorecards before each release.
- Re-run evaluation after model changes and major content refreshes.
- Track source freshness, indexing lag, and known unsupported content patterns.

## Open Questions To Validate in Next Meeting

- Confirm current Copilot Studio top-K behavior and whether any tenant/model-specific variation exists.
- Confirm Agent Builder retrieval fan-out details and any published equivalent to top-K.
- Confirm latest file-type support matrix for uploaded documents and SharePoint paths (especially markdown/text behavior in your exact tenant).
- Confirm Graph Connector practical scaling limits (items, refresh cadence, schema constraints) from current Microsoft product docs.

## Empirical Experiments: Claims That Cannot Be Proven From Docs Alone

The following claims appear in this brief but cannot be confirmed or refuted from repository docs, official Microsoft Learn pages, or community reports alone. Each requires a controlled live experiment. Results should be recorded in `docs/knowledge/retrieval-internals.md` with test date, model version, and Graph Grounding on/off.

---

### EXP-01: Copilot Studio top-K value

**Claim:** Retrieval returns the top 3 chunks per source (widely cited, not officially documented).
**Why docs cannot prove it:** No official Microsoft Learn page publishes a fixed K value. The figure is a community assertion.
**Why it matters:** Determines how to size knowledge documents and whether cross-chunk synthesis is reliable.

**Experiment — boundary fact injection:**
1. Create one document with 8 identically-structured sections (~150 words each). Each section contains exactly one unique, non-inferable token fact: `RETRIEVAL_FACT_N: [unique code]`.
2. Upload as the sole knowledge source to a test agent with no other sources, no web search, no general knowledge.
3. Ask: *"List every retrieval fact and its code from this document."*
4. Repeat 15 times. Record which facts appear in each response.
5. The count of facts that appear in ≥80% of runs is the empirical top-K estimate.

**Control variables:** single file, uniform section length, no Graph Grounding initially. Repeat with Graph Grounding enabled to detect stack differences.

**Pass/fail:** convergence between fact frequency and a stable cut-off point. If no stable cut-off, K is variable.

---

### EXP-02: Declarative agent (Agent Builder) retrieval depth

**Claim:** No published top-K equivalent exists for declarative agents; behaviour is assumed similar to CPS.
**Why docs cannot prove it:** Microsoft has not published a fixed K value for the M365 Copilot semantic index path used by declarative agents.
**Why it matters:** CxO Digital Twin will likely be deployed as a declarative agent in M365 Copilot. If K differs from CPS, document sizing strategy changes.

**Experiment:** Repeat EXP-01 verbatim using a declarative agent in Agent Builder with the same document, same queries, same repetition count. Compare the empirical K to the CPS result from EXP-01.

**Pass/fail:** same cut-off as CPS = same architecture guidance applies. Different cut-off = update `retrieval-internals.md` with separate values and adjust document sizing recommendations.

---

### EXP-03: Effect of Graph Grounding on effective top-K and chunk quality

**Claim:** Tenant Graph Grounding with semantic search "dramatically improves SharePoint results" (repo docs). The retrieval stack differs, but whether K changes is unknown.
**Why docs cannot prove it:** Repo and official docs confirm the quality lift qualitatively; neither publishes whether the semantic index returns more chunks or better-ranked chunks.
**Why it matters:** If Graph Grounding changes K or ranking, the document design and chunking guidance differs for licensed vs unlicensed deployments.

**Experiment:**
1. Run EXP-01 with Graph Grounding **off** and record empirical K.
2. Re-run with Graph Grounding **on** using the same document uploaded to SharePoint (unstructured path) rather than direct upload.
3. Compare: (a) which facts are retrieved, (b) consistency across runs, (c) whether answer quality improves independent of K.

**Pass/fail:** if K changes, document the delta. If only quality/consistency improves (not K), that confirms the "quality lift" claim quantitatively.

---

### EXP-04: Content moderation level effect at topic/prompt-tool scope vs agent scope

**Claim:** Official docs state moderation can be set at agent, topic-node, and prompt-tool level with precedence. The repo previously stated it was agent-level only.
**Why docs cannot prove it:** The repo has been updated to reflect the official docs claim, but no live test has confirmed the precedence rules behave as documented.
**Why it matters:** For the CxO Twin, some SME topics handle regulatory/financial language that triggers false positives at Medium/High. If topic-level override works reliably, there is no need to lower the whole agent to Low.

**Experiment:**
1. Set agent to `High`. Add a topic with Generative Answers node set to `Low`. Ask a question containing financial/compliance vocabulary known to trigger filtering at High.
2. Record whether the response is blocked (agent setting wins) or succeeds (topic override works).
3. Repeat with a prompt tool set to `Low` inside a topic set to `High`.
4. Map the actual precedence order from observed behaviour vs documented order.

**Pass/fail:** topic and prompt-tool overrides behave as documented = confirmed, update `constraints.md` confidence to High. Overrides ignored = add a hard-constraint note.

---

### EXP-05: Sub-agent hallucination reduction — measurable or architectural myth?

**Claim:** Narrower child agent scope reduces hallucination risk (section 4 of this brief). Repo patterns support this architecturally; no quantitative evidence exists.
**Why docs cannot prove it:** The claim is a logical inference from scope isolation. Neither official docs nor repo benchmarks measure hallucination rates for single-agent vs multi-agent deployments.
**Why it matters:** The CxO Twin architecture depends on this assumption. If child agent scope isolation does not measurably reduce hallucination on domain-specific questions, the complexity cost is not justified.

**Experiment:**
1. Define 20 domain-specific questions that require grounded answers from a known knowledge set (Finance SME domain). Record ground truth answers.
2. Build two agents: (A) single flat agent with all knowledge sources, (B) orchestrator + Finance SME child with only Finance knowledge.
3. Run all 20 questions against both agents, 5 repetitions each. Score each answer: Correct / Grounded but incomplete / Hallucinated / Refused.
4. Compare hallucination rates and refusal rates between A and B.

**Pass/fail:** B shows lower hallucination rate than A = architecture justified. No difference = investigate whether the knowledge partitioning (not the agent structure) is the real variable.

---

### EXP-06: >25 source threshold — does source-selection GPT introduce retrieval errors?

**Claim:** Beyond 25 knowledge sources, an internal GPT filters which sources to search based on descriptions. Poor descriptions make sources invisible.
**Why docs cannot prove it:** The threshold is documented in the repo but the error mode (sources silently not searched) has not been tested empirically.
**Why it matters:** A CxO Twin with 10+ SME domains and multiple documents per domain can easily approach 25+ sources. Silent source exclusion is an invisible failure mode.

**Experiment:**
1. Create 30 knowledge sources, each a single focused document with a distinct, well-written description. Include 5 sources with deliberately vague descriptions ("Document about business.").
2. Ask questions that should be answered by the vague-description sources.
3. Record whether those sources are used (check Activity Map knowledge node invocations).
4. Compare hit rate: well-described sources vs vague sources.

**Pass/fail:** vague sources show materially lower hit rate = confirmed, descriptions are critical at scale. No difference = threshold or mechanism behaves differently than documented.

---

### EXP-07: SharePoint URL path vs unstructured path — retrieval quality difference on identical content

**Claim:** The two SharePoint paths (URL vs files/folders) produce different retrieval behaviour and freshness.
**Why docs cannot prove it:** The two-path distinction is documented (now updated in repo), but no direct A/B retrieval quality test has been run on identical content.
**Why it matters:** Teams choosing between SharePoint URL and file-upload paths need concrete guidance on which produces better grounding for document-style knowledge.

**Experiment:**
1. Prepare 5 test documents with known ground-truth Q&A pairs.
2. Add the same documents to one test agent via SharePoint URL path and to a second identical agent via SharePoint files/folders (unstructured) path.
3. Ask the same 5 questions against both agents after full indexing (wait 6+ hours for unstructured path).
4. Score: Correct / Grounded / Hallucinated / Refused.
5. Record freshness lag by editing one document and observing how quickly each path reflects the change.

**Pass/fail:** if quality is equivalent, path choice is mainly a freshness/admin decision. If URL path scores materially higher, update guidance to prefer URL path when content is in modern SharePoint pages.

## Bottom Line

For your CxO Digital Twin and SME-agent strategy, the highest-return move is architecture and content engineering, not tuning knobs (because the platform exposes very few). Prioritize domain partitioning, source descriptions, dual-placement, and orchestrator-led context control. This consistently reduces hallucination risk while preserving scalability.

## Second Pass: Official Docs + Community Cross-Check (2026-05-12)

Scope of this pass:

- Official docs: Microsoft Learn and Microsoft Power Platform blog pages under Copilot Studio knowledge/orchestration/settings.
- Community: Power Platform Community threads and other public community posts discovered from search.

Confidence rubric used:

- High: official Microsoft Learn page with explicit statement.
- Medium: Microsoft blog or Microsoft staff/community statements that align with docs.
- Low: unaffiliated community/blog/video claims not independently validated.

Key deltas identified in this pass:

1. Content moderation controls
- Repo states moderation is effectively portal-only with no per-topic/tool override.
- Official docs now state moderation can be set at agent level, topic-level generative answers node, and prompt tool level (with precedence rules).

2. SharePoint path behavior is split
- Official docs clearly describe two SharePoint patterns with different runtime behavior:
  - SharePoint URL/connector path (real-time freshness, SharePoint search stack)
  - Unstructured upload-from-SharePoint path (copied into Dataverse, 4-6 hour refresh)
- This explains why teams report inconsistent behavior when comparing "SharePoint knowledge" results.

3. File support matrix is broader in official docs
- Official uploaded-file support explicitly includes .md, .txt, .json, .yaml, .csv, .xml, .tex, and more.
- Repo had partial guidance emphasizing office docs/PDF as safest.

4. Top-K remains undocumented in current official pages
- No explicit top-K number was found in the official pages reviewed.
- Your prior "top-3" statement remains plausible but is not directly confirmed by the current official text in this pass.

### Comparison Table (Question vs Original vs Repo vs Official vs Community)

| Question | Original answer | Repo | Official | Community |
|---|---|---|---|---|
| Are Copilot Studio/Agent Builder retrieval-first (vs full document in context)? | Yes, both are RAG/retrieval-driven. | Aligns: generative mode retrieves across configured sources; non-deterministic retrieval noted. | Aligns: generative orchestration selects knowledge/tools/topics and summarizes returned results. | Aligns broadly; repeated anecdotes of retrieval misses/hallucinations in large corpora. |
| Can makers control chunking/top-K/retrieval algorithm? | No direct maker controls. | Aligns strongly: no chunking controls; no query-mode/reranker/filter controls documented. | Aligns for chunking internals and retrieval knobs; docs emphasize source/config descriptions, not low-level retrieval tuning. | Aligns; common workaround advice is content restructuring, not platform knobs. |
| Copilot Studio top-K is 3? | Stated yes (top 3 per source). | Not explicitly documented in repo text as a firm product guarantee. | Not found as explicit top-K value in reviewed official pages. | No reliable consensus; anecdotal claims vary. |
| Agent Builder/declarative top-K published equivalent? | Not published. | Aligns: no fixed declarative top-K documented. | No explicit fixed value found in reviewed docs. | No credible fixed number found. |
| Does file type materially affect grounding quality? | Yes. | Aligns strongly: structure/extractability and formatting quality matter. | Aligns: supported file type matrix and known unsupported/encryption constraints; retrieval behavior depends on source path. | Aligns with many anecdotal reports (PDF-heavy corpora often less consistent). |
| Uploaded document format support (.md, .txt, .docx, .pdf, .xlsx)? | Broad set claimed. | Partially covered in repo; not one canonical matrix. | Explicit broad matrix for uploaded files including .md/.txt/.json/.yaml/.csv/.xml/.tex plus Office/PDF. | Mostly aligns; practitioners still report quality variance by format and structure. |
| SharePoint sources: known failure modes and limits? | Yes (licensing, indexing, quality caveats). | Aligns: licensing gates, unsupported patterns, indexing delays. | Aligns and adds explicit split between SharePoint URL mode and uploaded-from-SharePoint unstructured mode, with different freshness/filtering behavior. | Aligns with reports of stale/uneven answers when source mode is misunderstood. |
| Chunking strategy guidance when maker controls are absent | Use clear structure/headings and cleaner docs. | Aligns strongly. | Aligns indirectly: docs describe chunking/vector indexing and emphasize source quality/description. | Aligns; recurring recommendation is split/clean files and reduce mixed-topic documents. |
| Biggest lever for ~20 short/medium files | Structure and source design over format alone. | Aligns strongly (single-topic docs, descriptions, dual-placement). | Aligns: high-quality descriptions aid orchestration; filters/settings and source choice matter. | Aligns: accepted forum outcomes often improved after cleanup + splitting sources. |
| Content moderation behavior and controls | Presented as major grounding control. | Repo says portal-only, limited tunability. | Differs: moderation available at agent, topic node, and prompt tool levels; topic level precedence documented. | Community often treats moderation as indirect/noisy control; not primary fix for hallucination. |
| Allow ungrounded responses effect | Turning off reduces hallucination risk. | Aligns. | Aligns with important nuance: OFF blocks responses when no source/tool used that turn, but does not fully eliminate model priors mixed into grounded responses. | Aligns; reports exist of perceived leakage even when OFF, matching official nuance. |
| Work IQ effect (quality/latency) | Improves search quality, especially SharePoint. | Aligns: semantic-index grounding improves retrieval quality. | Aligns and adds caveat: can increase latency and may not help in all tenant/query conditions. | Mixed anecdotes: many report improvement, some report better results with it OFF for specific corpora. |
| Are settings hard constraints or soft guidance? | Mixed. | Aligns: platform limits are hard, prompt instructions soft. | Aligns: documented hard constraints plus configurable behaviors (ungrounded/web search/filter/auth). | Aligns broadly. |
| Does markdown prompt structure matter? | Yes, structured markdown helps. | Aligns with prompt-structure best practices. | Indirectly aligns (official guidance favors clear, concise, structured descriptions/instructions). | Common practice supports this; not a deterministic guarantee. |
| How to prioritize internal over web | Disable ungrounded, constrain sources, stronger prompt guidance. | Aligns. | Aligns and adds explicit guidance: if filtering SharePoint strictly, turn off web search and general-knowledge paths to force no-answer outside filtered results. | Aligns with practitioner advice. |
| Why sub-agents can reduce hallucination | Better scope isolation and orchestration boundaries. | Aligns (orchestrator patterns, scoped specialists). | Official orchestration docs confirm multi-step selection across topics/tools/agents; do not explicitly claim hallucination reduction. | Common architectural claim; evidence mostly experiential. |
| Scaling pattern from POC to production | Partition domains and architect retrieval paths. | Aligns strongly (>25 source filtering, source description critical, dual-placement). | Aligns: >25 source filtering by internal GPT based on descriptions; source architecture matters. | Aligns strongly in forum practice (cleaning, deduping, splitting large libraries). |
| Dataverse upload vs SharePoint vs custom knowledge source | Choose by control/freshness/governance needs. | Aligns with custom pipeline recommendation for advanced control. | Aligns and clarifies runtime differences across source types (real-time vs scheduled sync, filtering options). | Aligns; community reports significant behavior differences by source mode. |
| Graph Connectors vs SharePoint libraries | Not fully answered yet. | Repo has limited direct coverage. | Official pages reviewed describe connector-based enterprise knowledge and semantic index use, but do not provide a direct apples-to-apples quality benchmark in one place. | Community has opinions but no reliable quantitative benchmark. |

### Official Sources Consulted (Second Pass)

- https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-copilot-studio
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-generative-actions
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-unstructured-data
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-add-sharepoint
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-add-file-upload
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/nlu-boost-node
- https://www.microsoft.com/en-us/power-platform/blog/2025/03/27/knowledge-in-microsoft-copilot-studio/

### Community Sources Consulted (Second Pass)

- https://community.powerplatform.com/forums/thread/details/?threadid=2e0218c3-423d-f011-b4cc-7c1e52027a5f
- https://learn.microsoft.com/en-gb/answers/questions/5620401/microsoft-copilot-agent-struggle-with-hallucinatio
- Search-discovered community/blog/video references were reviewed only as low-confidence supporting signals unless corroborated by official docs.