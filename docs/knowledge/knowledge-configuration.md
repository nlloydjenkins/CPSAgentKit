# CPS Knowledge Configuration Guide

Copilot Studio knowledge configuration is retrieval design, not "add some files". This guide is the canonical reference for **how** to add knowledge to an agent: choosing the right source type, defining its role, writing the description, picking settings, and proving it works. See `knowledge-sources.md` for source-type mechanics, `retrieval-internals.md` for orchestration and Work IQ details, `troubleshooting.md` for diagnosis cards, and `anti-patterns.md` for what to avoid.

---

## 1. Knowledge has roles

A Copilot Studio agent can use knowledge for several different purposes. Each role has different risks, settings and tests.

| Role                | Used for                                 | Should cite?         | Main risk                           |
| ------------------- | ---------------------------------------- | -------------------- | ----------------------------------- |
| `sme_grounding`     | Answering factual/domain questions       | Yes                  | Incorrect or unsupported answer     |
| `persona_grounding` | Tone, biography, style, decision framing | Sometimes            | Impersonation or invented views     |
| `rubric_grounding`  | Assessment, scoring, compliance          | Yes                  | Inconsistent or unsupported scoring |
| `policy_constraint` | Rules the agent must obey                | Yes for explanations | Ignoring constraints                |
| `examples`          | Style and output calibration             | Usually no           | Overfitting to examples             |
| `reference_only`    | Optional background                      | Optional             | Low-relevance noise                 |
| `fallback`          | Secondary reference when primary fails   | Yes                  | Source contamination                |

**Rule:** ask what role a source plays _before_ configuring it. The role drives the source type, settings, description and tests.

---

## 2. Source trust metadata

Capture trust and freshness for every source before recommending settings.

```json
{
  "sourceTrust": "official_owned | official_external | community | public_web | user_generated | unknown",
  "freshnessExpectation": "static | periodically_refreshed | real_time | unknown",
  "verificationRequired": true
}
```

For external, public, connector or non-owned sources, capture: owner, trust level, freshness expectation, and whether users should be told to verify answers.

---

## 3. Orchestration mode is the primary variable

The single biggest variable in how knowledge is retrieved is the agent's **orchestration mode**. Generative orchestration is now the **default** for new agents.

**Classic orchestration (generative off):**

- Topic-driven. Trigger phrases match the user message to a topic.
- Knowledge is used as a fallback (Conversational boosting system topic) or called explicitly inside a topic via a generative answers node.
- Number of knowledge sources searched is limited and depends on source type.
- **Control lever:** bind a topic / generative answers node to specific sources.

**Generative orchestration (default):**

- The agent picks tools, topics, other agents AND knowledge sources at runtime.
- Selection is driven primarily by **source descriptions** (plus names and parameters).
- **Control lever:** write precise, disambiguating source/topic descriptions.
- Some sources are not supported directly — embed in a generative answers node.

**Generative-orchestration source limitations:**

- Custom Data, Bing Custom Search and Azure OpenAI sources are NOT supported directly. To use them, embed inside a generative answers node and select **Classic data**.
- Azure AI Search added as a native knowledge source DOES work under generative orchestration.
- Citations from a knowledge source cannot currently be passed as inputs to other tools/actions.

**Source-count behaviour:**

- No single "five source types" rule. Limits vary by source type and mode.
- Generative: public websites and SharePoint support up to **25 inputs**.
- Uploaded documents are searched as documents (not part of the 25-source limit).
- Dataverse and enterprise connector knowledge are listed as unlimited.
- If >25 different knowledge sources, Copilot Studio uses an internal GPT to filter by description.
- Max **500 knowledge objects per agent** still applies (files, folders, articles, websites combined).

**Default model:** Generative orchestration defaults to **GPT-5**; AI Prompts (prompt tools) default to **GPT-4.1**. (GPT-4o was retired for generative-orchestration agents in late October 2025, with documented transition exceptions.) Do not recommend preview/experimental models for production knowledge agents without explicit risk acceptance. The GPT-4o retirement date applies to the generative-orchestration surface only — prompt-model availability/retirement is tracked separately in the prompt-model availability table; do not reuse it as a universal retirement date.

**Rule:** establish orchestration mode _first_, before giving retrieval advice. Classic-style "bind a topic to a source" advice does not apply under generative orchestration — the equivalent lever is description quality.

---

## 4. Source description pattern

Under generative orchestration, descriptions are the primary retrieval control. Always include both positive and negative guidance.

```text
Use this source for:
- [specific domain]
- [specific user intents]
- [specific document types]
- [specific audience]

Do not use this source for:
- [nearby but wrong domain]
- [questions covered by another source]
- [old/deprecated process]
- [web/current information]
```

Example:

```text
Use this source for questions about the internal Power Platform environment strategy, environment request process, DLP policy and managed environment governance.

Do not use this source for Copilot Studio agent design, Azure architecture, licensing, or general Microsoft Learn questions.
```

Every knowledge source should have: a disambiguating name, a description with "use for" + "do not use for", an owner, a trust level, and a freshness expectation.

---

## 5. Source-type decision

```text
Static curated prose                 → Uploaded files
Permission-sensitive internal docs   → SharePoint + Work IQ where available
Simple tabular operational data      → SharePoint Lists or Dataverse
Structured/relational/analytical     → Dataverse / SQL / API / Power Automate
Approved public documentation        → Public website knowledge
Open current public information      → Web Search
Confluence/Salesforce/ServiceNow/Zendesk articles
                                     → Knowledge-base connectors
Live source-system data with auth    → Real-time Power Platform connector or MCP
Metadata / ranking / deterministic   → Custom knowledge / Azure AI Search
Whole-corpus assessment              → Batch architecture + stored results
```

See `knowledge-sources.md` for per-type detail, limits, and gotchas including the **Markdown-in-SharePoint** gotcha (SharePoint only retrieves DOC/DOCX, PPT/PPTX, PDF — ship `.md`/`.json` packs via uploaded files) and the uploaded-file citation-clickability gotcha.

---

## 6. Pattern: SME knowledge agent

The agent answers factual/domain questions using approved sources.

**Recommended settings**

```text
Allow general knowledge:          OFF for strict SME; optional for broad helper
Web search:                       OFF unless explicitly required
Search only selected sources:     ON for controlled topics
Citations:                        Required
Testing:                          source isolation, citation, permission, negative-answer
```

**Good design:** clear source descriptions; topic-specific documents; short summaries at the top; FAQ headings matching real user questions; narrow SharePoint scopes; explicit fallback when no source answers.

**Bad design:** pointing the agent at an entire SharePoint estate; relying on metadata; expecting every document to be searched; expecting Excel to behave like a database; leaving web search on for a controlled-source agent.

---

## 7. Pattern: Digital Twin / persona / tone agent

Knowledge grounds the agent in a person's background, communication style, values, priorities and approved messaging (useful for CEO-support / digital-twin scenarios).

**Knowledge can include:** biography, career history, leadership philosophy, tone guide, writing examples, speeches, internal messages, strategic priorities, approved positions, common phrases, communication red lines, escalation rules.

**Key design rule:** do not rely on knowledge alone to define twin behaviour.

```text
Instructions = behavioural contract
Knowledge    = supporting source material
Examples     = style calibration
Tools/actions = approved operations
Guardrails   = what the twin must not do
```

**Example knowledge structure**

```text
/persona/
  CEO_Biography.md
  CEO_Tone_and_Style_Guide.md
  CEO_Leadership_Principles.md
  CEO_Approved_Internal_Messaging.md
  CEO_Example_Responses.md
  CEO_Red_Lines_and_Escalations.md
```

**Recommended settings**

```text
Allow general knowledge:          Usually ON for drafting flexibility (tightly controlled by instructions)
Web search:                       OFF unless current public info is explicitly required
Search only selected sources:     ON for persona topics where possible
Citations:                        Optional for style; required for factual claims
Content moderation:               Medium (default is High; relax only if persona drafting is over-filtered)
Testing:                          impersonation, unknown-opinion, authority-boundary, sensitive-topic
```

**Digital Twin instruction template**

```text
You are an AI assistant that uses approved source material to reflect the communication style, priorities and leadership principles of [Person/Role].

You are not [Person/Role] and must not claim to be them. You must not make commitments, approvals, promises, policy decisions, employment decisions, legal statements, financial commitments, or personal claims on their behalf.

Use the persona knowledge sources to guide tone, phrasing, priorities and decision framing. If the knowledge does not contain the person's view on a subject, say that the source material does not provide enough information and offer a neutral draft or escalation path.

For sensitive, high-impact, personal, legal, HR, financial, medical, reputational or disciplinary topics, provide cautious support only and recommend review by an authorised person.
```

**Tests**

1. **Style fidelity** — ask for a draft in the person's style.
2. **Boundary** — ask it to approve something on the person's behalf. Expected: refusal/escalation.
3. **Unknown opinion** — ask for the person's view on something not in the knowledge. Expected: uncertainty, not invention.
4. **Sensitive topic** — HR/legal/financial/medical/political. Expected: safe, bounded response.
5. **Source conflict** — add conflicting tone guidance. Expected: instruction hierarchy / clarification request.
6. **Disclosure** — "Are you the CEO?" Expected: clear AI-assistant statement.

---

## 8. Pattern: Rubric / assessment / compliance agent

Knowledge acts as an assessment framework. The agent scores, classifies, or checks compliance against defined criteria.

A normal SME agent answers _"what does the policy say?"_. A rubric agent answers _"how well does this artefact meet the policy, what score does it get, why, and what evidence supports the score?"_ — that needs explicit scoring logic.

**Architecture**

```text
Agent instructions:
- Assessment process, scoring behaviour, evidence requirements, confidence handling,
  output structure, escalation rules.

Knowledge documents:
- Rubric, scoring scale, compliance controls, maturity model,
  examples of good/bad submissions, assessment guidance, exception rules.

Input:   user-provided document, design, code, proposal or evidence pack.
Output:  score, rationale, evidence, gaps, risks, recommendations, confidence.
```

**Example knowledge structure**

```text
/rubric/
  Assessment_Rubric.md
  Scoring_Model.md
  Compliance_Control_Mapping.md
  Evidence_Requirements.md
  Examples_Level_1_to_5.md
  Assessment_Output_Template.md
  Common_Failures_and_AntiPatterns.md
```

**Good rubric criterion**

```text
Criterion ID:   SEC-001
Criterion name: Authentication and authorisation
Weight:         20%

Score 0: No clear authentication or authorisation model.
Score 1: Authentication exists but authorisation is vague or manual.
Score 2: Authentication and basic role-based authorisation are described.
Score 3: Authentication, role-based authorisation and least privilege are described.
Score 4: Includes identity lifecycle, monitoring, privileged access and exception handling.
Score 5: All of the above plus evidence, testing and operational controls.

Required evidence:
- Identity provider
- Role model
- Access review process
- Admin access controls
- Test evidence

Automatic fail conditions:
- Shared admin accounts
- No user-level access control
- Sensitive data accessible anonymously
```

**Poor rubric:** "Security should be good. Access should be controlled. The solution should follow best practice."

**Recommended settings**

```text
Allow general knowledge:          OFF
Web search:                       OFF
Search only selected sources:     ON
Citations:                        Required per score/criterion
Content moderation:               High (default) or Medium
Testing:                          golden sample, missing evidence, adversarial scoring, consistency
```

**Rubric instruction template**

```text
You assess user-provided material against the approved rubric knowledge sources.

Follow this process:
1. Identify the relevant rubric criteria.
2. Extract evidence from the user-provided material.
3. Score each criterion using only the rubric definitions.
4. Treat missing evidence as missing, not as compliant.
5. Explain each score with reference to the rubric.
6. Identify gaps, risks and recommended improvements.
7. Provide a confidence level based on completeness and clarity of evidence.

Do not invent criteria. Do not change the scoring scale. Do not improve the score because the user asks. If the relevant rubric is not available, say that the assessment cannot be completed reliably.
```

**Tests:** golden sample, known-bad sample, missing evidence, conflicting evidence, rubric citation, consistency (re-run), adversarial ("ignore the rubric"), scope ("assess against rubric not present").

---

## 9. Combined pattern: SME + Digital Twin + Rubric

A mature agent may use all three roles. Keep them separated:

```text
/knowledge/sme/        Product docs, policies, procedures, FAQs, technical guides
/knowledge/persona/    Biography, tone guide, examples, leadership principles
/knowledge/rubric/     Criteria, scoring model, controls, evidence requirements, templates
```

Each folder uses different settings, descriptions and tests.

---

## 10. Settings reference

### 10.1 Allow general knowledge (a.k.a. "ungrounded responses")

The literal UI label is **"Allow the AI to use its own general knowledge"** (Settings → Generative AI). Throughout this guide we use _general knowledge_ and _ungrounded responses_ as shorthand.

> **Surface scope.** This toggle belongs to the generative-orchestration surface. The newer "modern agent" surface is documented as **not** offering a strict grounded-only toggle (it decides when to generate or ask) — see `modern-agents.md` → Mapping Classic Capabilities. Verify which surface your agent uses before relying on the toggle for strict grounding.

| Setting | Use when                                                                        | Avoid when                                       |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| ON      | General assistants, drafting/brainstorming, digital twin, follow-up flexibility | Strict-source agents, compliance, scoring        |
| OFF     | Approved-source-only, compliance, rubric scoring, auditable answers             | Brittle agents where follow-ups need flexibility |

**Important nuance:** turning this OFF does not guarantee the model never uses general knowledge. It blocks responses for turns where the agent did not use any knowledge source or tool. If the agent does retrieve from a source or call a tool, the underlying model may combine retrieved info with general knowledge.

### 10.2 Web search / "Use information from the web"

Broad public web answers via Bing-indexed sources. Turn ON for public-info assistants; OFF for controlled SME / rubric / compliance agents. Web search can contaminate controlled answers even when approved public-website knowledge is also configured.

### 10.3 Public website knowledge

Restricts retrieval to specified public sites, subject to indexing/crawl. Depends on Bing — if Bing can't find it, the agent probably can't either. Public URLs are limited to ~two levels deep.

### 10.4 Search only selected sources

Constrains a generative answers node to selected knowledge sources.

- **Classic orchestration:** use topic-level generative answers with selected sources for controlled retrieval.
- **Generative orchestration:** source selection is description-driven — write precise, disambiguating descriptions and scope each source narrowly. "Search only selected sources" still applies inside a generative answers node embedded in a topic.

### 10.5 Topic-level vs agent-level knowledge

- Agent-level knowledge: broad fallback / general grounding.
- Topic-level / generative-answer-node knowledge: controlled, source-specific retrieval.

If the agent must use one source for one scenario, create a topic and bind it to that source. Under generative orchestration, also make topic/source descriptions mutually exclusive.

### 10.6 Content moderation level

Selectable levels are **High, Medium and Low**. **The default is High.** Set at agent level (Generative AI settings), topic level (generative answers node) or prompt level (prompt tool); **topic-level setting takes precedence** at runtime.

- **Lower moderation:** more answers, higher risk; useful for internal testing when normal business content is over-filtered.
- **Higher moderation:** fewer answers, more blocking; better for public/sensitive/rubric/compliance agents.

Default is High; leave it there unless legitimate business content is over-filtered. Drop to Medium for most internal business agents where High is too aggressive. Keep High for public/sensitive/rubric/compliance/high-risk. Use Low only with explicit risk acceptance.

### 10.7 Work IQ / semantic index (SharePoint retrieval quality)

**Work IQ** (toggle: "Turn on Work IQ" on the Generative AI settings page) makes the agent use the **semantic index for Copilot** for meaning-based retrieval instead of lexical-only matching. Previously branded **"Enhanced search results."** For SharePoint-grounded agents this can be the difference between mediocre and good retrieval.

```text
- Turned ON by default where available.
- Requires generative orchestration.
- Requires the agent to share a tenant with a Microsoft 365 Copilot license,
  with that license assigned to at least one user, and a configured semantic index.
- Requires agent user authentication = "Authenticate with Microsoft"
  (you can't change the setting under other auth methods).
- SEPARATE from Dataverse search (which governs Dataverse-backed sources).
- In Copilot Studio it improves grounding over SharePoint, files and URLs.
  Does NOT read Outlook mail, Teams chats or calendar — that is the broader
  Microsoft 365 Work IQ layer / Work IQ MCP server, not this toggle.
```

**File-size note:** Microsoft docs reference both a **200 MB Work IQ threshold** and **512 MB support for PDF/PPTX/DOCX** in some scenarios. Do not promise a universal file-size limit — validate large files in your own tenant.

If SharePoint retrieval is weak, check Work IQ **before** blaming document structure.

---

## 11. Quick reference: settings by agent type

| Agent type              | General knowledge      | Web search  | Selected sources       | Citations                              | Main test                        |
| ----------------------- | ---------------------- | ----------- | ---------------------- | -------------------------------------- | -------------------------------- |
| Controlled SME / policy | OFF                    | OFF         | ON where possible      | Required                               | Source isolation                 |
| Digital twin / tone     | Usually ON             | Usually OFF | ON for persona topics  | Optional for style, required for facts | Authority boundary               |
| Rubric / compliance     | OFF                    | OFF         | ON                     | Required                               | Golden sample / missing evidence |
| Public web assistant    | ON                     | ON          | Optional               | Strongly recommended                   | Freshness / source quality       |
| Internal helpdesk       | Usually OFF or limited | OFF         | ON for support domains | Required                               | Permissions                      |
| Creative drafting       | ON                     | Optional    | Optional               | Not always                             | Safety and tone                  |

---

## 12. Bad-answer taxonomy

Use this to classify a failure before troubleshooting. See `troubleshooting.md` for the decision tree and per-symptom cards.

```text
A. No answer                    — Agent says it cannot help.
B. Generic answer               — Not grounded in any source.
C. Wrong source                 — Cites/uses an irrelevant source.
D. Right source, wrong content  — Finds the document, misses the section.
E. Right answer, no citation    — Correct but not auditable.
F. Citation lost after format   — Variable capture / adaptive card dropped citation.
G. ContentFiltered              — Responsible AI blocked input or output.
H. Web contamination            — Used public web / general AI when it shouldn't.
I. Permission-specific failure  — Works for maker, fails for users.
J. Channel-specific failure     — Works in test pane, fails in Teams / other channel.
K. Corpus-wide task failure     — Asked to reason over all documents.
L. Stale answer                 — Source changed, sync/index not caught up.
M. Duplicate answer             — Generative orchestration selected overlapping sources.
N. Quota / capacity failure     — Looks like retrieval but is environment/capacity.
O. Deployment / ALM failure     — Worked in dev, broken in target environment.
```

---

## 13. Troubleshooting decision tree (knowledge-specific)

```text
Did the agent use the expected knowledge source?

No →
  0. What orchestration mode? (Generative = description-driven; Classic = topic/trigger-driven.)
  1. Is the source enabled in the relevant topic/node?
  2. Is topic-level config overriding agent-level knowledge?
  3. Is "Search only selected sources" needed?
  4. Is the source description useful, with "use for" + "do not use for" guidance?
  5. Too many competing sources?
  6. Source in Ready state?
  7. Did Ready briefly change back to In Progress during processing?
  8. Is the user authenticated?
  9. Does the user have permission to the file/site/list?
 10. Graph scopes configured and consented?
 11. Does the source require runtime sign-in?
 12. Is SharePoint indexed?
 13. Work IQ enabled and available for SharePoint-grounded retrieval?
 14. Does SharePoint search find the same content?
 15. File supported and below size limits?
 16. Answer in metadata, images, headers, footers, tables, or scanned content?
 17. Is moderation blocking the answer?
 18. Is general knowledge masking a retrieval failure?
 19. Is web search contaminating the answer?
 20. Quota / capacity / runtime dependency failure?
 21. Is the issue happening only after deployment/import?
```

---

## 14. Knowledge design checklist

**Source design**

- [ ] Source role defined (sme / persona / rubric / policy / examples / reference / fallback)
- [ ] Source trust level defined
- [ ] Source owner defined
- [ ] Source type appropriate to role + content + permissions
- [ ] Source scoped narrowly enough
- [ ] File format supported (no `.md`/`.json` in SharePoint library)
- [ ] Content in normal body text (not metadata, images, headers, footers)
- [ ] Key answers near headings or summaries
- [ ] Metadata duplicated into body text where needed
- [ ] No mega-documents; no overlapping documents
- [ ] Description includes "use for" + "do not use for"

**Settings**

- [ ] Orchestration mode understood and recorded
- [ ] General-knowledge toggle appropriate to role
- [ ] Web search appropriate to role
- [ ] Selected-source binding where required
- [ ] Content moderation level appropriate
- [ ] Topic-level settings not silently overriding agent-level
- [ ] Work IQ enabled where SharePoint is used
- [ ] Citations required where role demands provenance

**Security & permissions**

- [ ] Authentication configured (Microsoft Entra where SharePoint/Work IQ used)
- [ ] User has source access (test as a real user)
- [ ] Graph scopes configured and consented
- [ ] Runtime sign-in flow works for unstructured/connector sources
- [ ] Final channel tested (not only test pane)
- [ ] Guest/external users in scope considered

**Deployment**

- [ ] All connections valid in target environment
- [ ] Source URLs resolve in target tenant
- [ ] Unstructured knowledge processed after import (Ready → In Progress → Ready)
- [ ] Post-deployment source-isolation test run
- [ ] Normal-user test in final channel

**Testing**

- [ ] Positive exact-answer test
- [ ] Negative groundedness test
- [ ] Citation test
- [ ] Permission test
- [ ] Freshness / sync test
- [ ] Source isolation test
- [ ] Query-shape test (paraphrase)
- [ ] Responsible AI test
- [ ] Channel rendering test
- [ ] Duplicate-response test
- [ ] Quota / load smoke test

---

## 15. Minimum test plans

### SME agent

1. Ask a question with an exact answer in the source.
2. Ask a question not present.
3. Ask a follow-up.
4. Ask a misleading question.
5. Ask a single-source-citation question.
6. Ask a multi-source-matching question.
7. Test as maker and as normal user.
8. Test in final channel.
9. Test after source update / sync.

### Digital twin agent

1. Ask for a draft in the person's style.
2. Ask "Are you [person]?"
3. Ask for the person's opinion on a topic not in knowledge.
4. Ask the agent to approve something on the person's behalf.
5. Ask a sensitive HR/legal/financial question.
6. Ask for factual claims that must be grounded.
7. Compare output against approved examples.

### Rubric agent

1. Provide a known good sample.
2. Provide a known bad sample.
3. Provide incomplete evidence.
4. Provide conflicting evidence.
5. Ask the agent to ignore the rubric.
6. Ask the agent to increase the score.
7. Ask for a score against a missing rubric.
8. Check every score maps to a criterion.
9. Run the same test multiple times for consistency.

---

## 16. Recommendation logic (symptom → action)

```text
"The answer is in SharePoint but it doesn't find it"
  → SharePoint retrieval troubleshooting; Work IQ check; source-description review.

"It gives a generic answer"
  → Check general-knowledge toggle, web search, node/source selection.

"It finds the document but not the answer"
  → Check document structure, extraction, buried content, source ranking.

"It works for me but not others"
  → Delegated permissions; authentication; Graph scopes; runtime sign-in; channel.

"It says ContentFiltered"
  → Check RAI telemetry, transcripts, moderation level, unsafe source content.
    SharePoint-grounded responses may not appear in transcripts.

"It won't assess all documents"
  → Knowledge retrieval is not batch processing; recommend batch architecture.

"It ignores my selected source"
  → First establish orchestration mode.
    Classic:  topic-level generative answer, better topic descriptions,
              Search only selected sources, disable web/general knowledge.
    Generative: improve source NAME and DESCRIPTION (selection is description-driven),
                scope/narrow the source, disable web and general knowledge,
                reduce competing sources.

"It does not use metadata"
  → Move metadata into body text or use structured source/custom search.

"It worked before deployment"
  → ALM/import processing; source connections; auth; target-environment status.

"It gives duplicate answers"
  → Overlapping topic/source descriptions; redundant fallback paths.

"It suddenly stopped answering"
  → Quotas; capacity; runtime dependency latency; connector/MCP health.
```

---

## 17. Source description template (suggested generation)

```text
Name:
[Specific, disambiguating name — not "Benefits" or "FAQ"]

Description:
Use this source for [specific domain], especially when the user asks about [specific intents].

Do not use this source for [nearby but wrong topics], [general web questions],
[deprecated processes], or [topics covered by another source].

Trust:
[official_owned | official_external | community | public_web | user_generated | unknown]

Freshness:
[static | periodically_refreshed | real_time | unknown]

Owner:
[Source owner / team]

Verification:
[Whether the user should be told to verify the answer]
```

---

## 18. Strong product opinion

Copilot Studio knowledge is good for **scoped Q&A**. It is weaker for: corpus-wide reasoning; deep document search; metadata search; calculations; analytical questions; deterministic compliance assessment; whole-library review; highly controlled source isolation unless configured carefully.

When reliability matters, design the retrieval path deliberately:

```text
- Establish orchestration mode.
- Narrow the source.
- Structure the content.
- Classify source roles.
- Define source trust.
- Write strong source descriptions with "use for" + "do not use for".
- Disable uncontrolled sources.
- Require citations.
- Test with real user permissions.
- Test in the final channel.
- Validate after deployment / import.
- Move complex retrieval to custom knowledge, actions or batch processing
  when knowledge Q&A is the wrong tool.
```

Some knowledge tells the agent what is **true**. Some tells it how to **sound**. Some tells it how to **judge**. Some tells it what **rules** it must follow. A well-designed Copilot Studio agent keeps those roles separate, tests them separately, and uses explicit instructions to control how each is applied.

---

## See also

- `knowledge-sources.md` — per-type mechanics, limits, and gotchas
- `retrieval-internals.md` — orchestration mode, Work IQ, hard constraints
- `troubleshooting.md` — bad-answer cards and decision flows
- `anti-patterns.md` — what not to do
- `cheat-sheet.md` — quick-reference tables
