# CPSAgentKit Knowledge & Best Practices Review

_Assessment date: 23 March 2026_
_Scope: 9 knowledge files (`docs/knowledge/`) + 5 best practices files (`docs/bestpractices/`)_

---

## Executive Summary

The knowledge base is **comprehensive and largely accurate**, covering the Copilot Studio platform from constraints through multi-agent architecture to prompt engineering. The best practices files add substantial value with specific numeric limits, governance guidance, and gotcha documentation that the knowledge files lack.

The primary issues are **heavy duplication across files**, **inconsistent severity language** for the same limitation, and **several topic gaps** in the knowledge files that only the best practices files address. Addressing these would reduce token consumption (these files are injected into Copilot context), improve consistency, and make maintenance easier.

---

## 1. Cross-Document Consistency Issues

### 1.1 MCP on Child Agents — Inconsistent Severity

The same limitation is described with different confidence levels:

| File                        | Language used                                          |
| --------------------------- | ------------------------------------------------------ |
| `constraints.md`            | "**may not** execute reliably (field observation)"     |
| `cheat-sheet.md`            | "Child agent's MCP server tools **are not invoked**"   |
| `multi-agent-patterns.md`   | "MCP server tools on child agents are **NOT invoked**" |
| `part4-tools-multiagent.md` | "Tool invocation **fails**"                            |
| `part5-gotchas-bugs.md`     | "Child agents **cannot** invoke MCP servers"           |

**Recommendation:** Align to the strongest language ("are not invoked / fails") since multiple sources confirm this. Update `constraints.md` to remove the hedged "may not" — it undermines confidence in the guidance.

### 1.2 Content Moderation — Apparent Contradiction

- `constraints.md` states: "`contentModeration` can be set to `Low`, `Medium`, or `High` in agent settings YAML."
- `part5-gotchas-bugs.md` states: "No way to tune or override content moderation."

These are both true but appear contradictory. The YAML setting controls the _threshold_, but there is no per-topic or per-utterance override, and no transparency when filtering triggers. `constraints.md` should add a clarifying note that setting the level is the _only_ available control and it doesn't provide diagnostic information.

### 1.3 Instruction Limit — Inconsistent Framing

The 8,000-character instruction limit appears in 7+ files with subtly different framing:

- `part1-platform.md`: "roughly 1,500 words" (adds useful context)
- `constraints.md`: "Quality and routing may degrade before hitting it"
- `cheat-sheet.md`: "Quality and routing may degrade before hitting it with dense or complex instructions"
- `prompt-engineering.md`: "Quality may degrade before the limit with dense or complex instructions"
- `anti-patterns.md`: "Beyond ~2000 characters, you get latency, timeouts, and degraded routing"

The `anti-patterns.md` version introduces a specific 2,000-character threshold not mentioned elsewhere and contradicts the general guidance that quality degrades _before_ the 8,000 limit but not at a fixed point.

**Recommendation:** Remove the "~2000 characters" claim from `anti-patterns.md` — it's not corroborated by any other file and may mislead users into thinking 2,000 is a hard quality boundary. Replace with the consistent message used elsewhere.

### 1.4 Specialist Agent Leaking — Repeated Across Many Files

The same guidance (positive scope + explicit prohibitions) appears in:

- `anti-patterns.md` (Missing agent boundary prohibitions)
- `cheat-sheet.md` (Specialist agents leak into each other's domains)
- `multi-agent-patterns.md` (Agent Boundary Enforcement section via prompt-engineering reference)
- `prompt-engineering.md` (Agent Boundary Enforcement section)

All four say essentially the same thing. This is an important pattern, but having it in four places means four places to maintain.

**Recommendation:** Make `multi-agent-patterns.md` the authoritative source. Other files should reference it briefly rather than re-explaining the full pattern.

---

## 2. Significant Duplications

These are areas where the same information is repeated at length across multiple files, increasing token consumption without adding value.

### 2.1 `cheat-sheet.md` vs. Everything Else

`cheat-sheet.md` is the biggest duplication source. It repeats content from nearly every other knowledge file:

| Cheat-sheet section      | Duplicated from                             |
| ------------------------ | ------------------------------------------- |
| Orchestration            | `constraints.md`                            |
| Tools & Routing          | `constraints.md`, `tool-descriptions.md`    |
| Multi-Agent              | `multi-agent-patterns.md`, `constraints.md` |
| Knowledge & Retrieval    | `knowledge-sources.md`, `constraints.md`    |
| Instructions & Prompting | `prompt-engineering.md`, `anti-patterns.md` |
| Deployment & Channels    | `anti-patterns.md`                          |
| ALM & Lifecycle          | `anti-patterns.md`                          |
| YAML & Extension         | Unique (mostly)                             |

**Recommendation:** Restructure `cheat-sheet.md` as a **concise quick-reference** — one-liner per gotcha with a pointer to the detailed file. Currently it's a ~1,800-word comprehensive reference that largely duplicates the specialist files. The YAML & Extension section is unique and valuable; everything else is repeated.

### 2.2 `part5-gotchas-bugs.md` vs. `cheat-sheet.md`

These two files have ~70% content overlap. Both are organised as "things that catch you out." The bestpractices version adds:

- "Silent Failures" categorisation (useful)
- "Marketing vs. Reality" section (unique)
- "API Plugin Limitations" section (unique)
- "Licensing Confusion" section (unique)
- "Platform Stability Issues" section (unique)

But the core gotchas (7MB silent limit, ghost knowledge sources, Teams versioning, content filtering opacity, etc.) are repeated verbatim or near-verbatim.

**Recommendation:** Accept the overlap as intentional — knowledge files serve Copilot context injection during development, while bestpractices files serve the assessment feature. However, consider whether both need the same level of detail, or whether knowledge files could be more concise.

### 2.3 Multi-Agent Guidance Spread

Multi-agent patterns are covered in:

- `multi-agent-patterns.md` — comprehensive (authoritative)
- `cheat-sheet.md` Multi-Agent section — summary
- `anti-patterns.md` Architecture and Multi-Agent sections — what not to do
- `constraints.md` Multi-Agent section — platform limits
- `part4-tools-multiagent.md` — assessment-focused
- `part3-agent-design.md` — touches on it in orchestration context

**Recommendation:** `multi-agent-patterns.md` should remain the authoritative source. `constraints.md` should keep the hard limits. `anti-patterns.md` should keep the anti-patterns. Other files should reduce their multi-agent content to brief references.

### 2.4 Knowledge Source Guidance Spread

- `knowledge-sources.md` — comprehensive design guide (authoritative)
- `cheat-sheet.md` Knowledge & Retrieval section — summary of gotchas
- `constraints.md` Knowledge Sources section — hard limits
- `anti-patterns.md` Knowledge Anti-Patterns section — what not to do
- `part1-platform.md` — specific numeric limits
- `part3-agent-design.md` — knowledge quality guidelines and source type table
- `part5-gotchas-bugs.md` — silent failures

The `part3-agent-design.md` source type comparison table and knowledge quality guidelines partially duplicate `knowledge-sources.md` but add a useful tabular format.

**Recommendation:** Keep both — the bestpractices version serves assessment, the knowledge version serves development guidance. No action needed beyond the cheat-sheet trimming.

---

## 3. Gaps — Topics Missing from Knowledge Files

### 3.1 Autonomous Agents and Event Triggers _(HIGH)_

`part4-tools-multiagent.md` covers autonomous agents (event triggers, scheduled triggers, maker credentials limitation, credit consumption, DLP blocking, design guidance for idempotency). **None of this appears in any knowledge file.**

**Recommendation:** Add an "Autonomous Agents" section to `multi-agent-patterns.md` or create a new `autonomous-agents.md` knowledge file. This is a growing area and Copilot needs this context during development.

### 3.2 Declarative Agents for M365 Copilot _(HIGH)_

`part4-tools-multiagent.md` covers declarative agent constraints (M365 Copilot licence requirement, no service principals, nested OpenAPI not supported, OAuth limitations, link rendering issues, developer licence for testing). **Not covered in knowledge files.**

**Recommendation:** Add a `declarative-agents.md` knowledge file. Declarative agents are a distinct development target with unique constraints.

### 3.3 Licensing and Billing Patterns _(MEDIUM)_

`part1-platform.md` and `part5-gotchas-bugs.md` cover Copilot Credits, M365 vs Copilot Studio licences, testing credit consumption, proactive greeting billing. Knowledge files don't address licensing at all.

**Recommendation:** Add a brief licensing section to `constraints.md` covering the credit model, what consumes credits, and the M365 Copilot licence interaction. Developers regularly make incorrect assumptions about billing.

### 3.4 Security and Governance Patterns _(MEDIUM)_

`part2-alm-governance-security.md` covers DLP enforcement, Purview DLP for M365 Copilot, oversharing mitigation (RSS, sensitivity labels, SAM), sharing controls, monitoring/auditing. Knowledge files only mention DLP in passing.

**Recommendation:** Add a `governance-security.md` knowledge file or expand `constraints.md` with a security section. Developers building agents need to know what DLP policies could block their tools and how auth flows interact.

### 3.5 CPS Settings Reference _(LOW)_

`part4-tools-multiagent.md` documents important settings: orchestration mode toggle, deep reasoning, content moderation, authentication settings, agent-level credit caps, channel descriptions, multi-language configuration. Knowledge files don't consolidate settings guidance.

**Recommendation:** Add a "Settings" section to `constraints.md` or `cheat-sheet.md`. The orchestration mode toggle, deep reasoning option, and channel description field are frequently missed by developers.

### 3.6 Custom Triggers _(LOW)_

`part3-agent-design.md` documents three custom trigger types (OnKnowledgeRequested, AI Response Generated, On Plan Complete) with implementation guidance. Not covered in knowledge files.

**Recommendation:** Add to `prompt-engineering.md` or `cheat-sheet.md`. The `OnKnowledgeRequested` trigger is particularly valuable for advanced knowledge routing scenarios.

---

## 4. Individual File Assessments

### Knowledge Files

| File                      | Quality              | Issue                                                                                | Action                                                                                     |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `anti-patterns.md`        | Good                 | "~2000 characters" claim unsubstantiated; duplicates multi-agent boundary guidance   | Fix the 2K claim; trim multi-agent boundary section to reference `multi-agent-patterns.md` |
| `cheat-sheet.md`          | Accurate but bloated | 70%+ duplicates other knowledge files                                                | Restructure as concise quick-reference with pointers                                       |
| `constraints.md`          | Good                 | Missing licensing, security, settings sections; MCP language too soft                | Add missing sections; firm up MCP language; add content moderation clarification           |
| `direct-line-api.md`      | Excellent            | Standalone, focused, actionable                                                      | No changes needed                                                                          |
| `knowledge-sources.md`    | Excellent            | MCP live knowledge pattern is unique and valuable                                    | No changes needed                                                                          |
| `multi-agent-patterns.md` | Excellent            | Comprehensive, well-structured; add autonomous agents                                | Add autonomous agent section                                                               |
| `prompt-engineering.md`   | Excellent            | Minor overlap with anti-patterns on instruction accumulation                         | No changes needed (overlap is acceptable — different perspective)                          |
| `tool-descriptions.md`    | Good                 | Concise and focused                                                                  | No changes needed                                                                          |
| `troubleshooting.md`      | Good                 | Dataverse MCP 403 guide is valuable; could add more autonomous agent troubleshooting | Minor expansion as autonomous agents grow                                                  |

### Best Practices Files

| File                               | Quality   | Issue                                                                                                                                                              | Action                                                              |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `part1-platform.md`                | Excellent | Specific numeric limits not found elsewhere; high unique value                                                                                                     | No changes needed                                                   |
| `part2-alm-governance-security.md` | Excellent | Covers security/governance gap in knowledge                                                                                                                        | No changes needed                                                   |
| `part3-agent-design.md`            | Very good | Overlaps with `prompt-engineering.md` and `knowledge-sources.md` on instructon/knowledge guidance, but adds T-C-R framework, three control layers, custom triggers | Acceptable overlap — different audience (assessment vs development) |
| `part4-tools-multiagent.md`        | Very good | Unique value in autonomous agents, declarative agents, settings                                                                                                    | No changes needed                                                   |
| `part5-gotchas-bugs.md`            | Very good | Heavy overlap with `cheat-sheet.md`, but unique "silent failures" organisation, licensing confusion, marketing-vs-reality sections                                 | No changes needed — if cheat-sheet is trimmed, the overlap resolves |

---

## 5. Prioritised Recommendations

### High Priority

1. **Firm up MCP child-agent language in `constraints.md`** — Change "may not execute reliably" to "are not invoked" to match all other sources.

2. **Fix the "~2000 characters" claim in `anti-patterns.md`** — Replace with the consistent message about quality degrading before the 8,000 limit without citing a specific threshold.

3. **Add autonomous agents section to `multi-agent-patterns.md`** — Cover event triggers, maker credentials, credit consumption, idempotency patterns. Source from `part4-tools-multiagent.md`.

4. **Create `declarative-agents.md` knowledge file** — Cover M365 Copilot specific constraints, licence requirements, API plugin limitations, developer licence for testing.

### Medium Priority

5. **Add licensing/billing section to `constraints.md`** — Credit model, what consumes credits, M365 licence interaction, proactive greeting billing.

6. **Add content moderation clarification to `constraints.md`** — Note that `Low/Medium/High` is the only control surface and it doesn't provide diagnostic info, to resolve the perceived contradiction with `part5-gotchas-bugs.md`.

7. **Add governance/DLP section to `constraints.md`** — DLP enforcement rules, what can be blocked, auth flow implications.

8. **Trim `cheat-sheet.md`** — Restructure as a concise quick-reference (one-liner per item with file references) rather than a comprehensive duplicate of other files. Keep the YAML & Extension section in full as it's the only source for that content.

### Low Priority

9. **Add CPS settings reference** to `constraints.md` or `cheat-sheet.md` — Orchestration mode, deep reasoning, channel description, multi-language.

10. **Add custom triggers** to `prompt-engineering.md` — OnKnowledgeRequested, AI Response Generated, On Plan Complete.

11. **Consolidate specialist agent boundary guidance** — Make `multi-agent-patterns.md` authoritative; reduce to brief references in `anti-patterns.md`, `cheat-sheet.md`, and `prompt-engineering.md`.

---

## 6. Content Accuracy Notes

All factual claims were cross-referenced across the 14 files. No outright factual errors were found. The information is consistent with publicly known Copilot Studio behaviour as of March 2026. Specific notes:

- The GPT-5 mention in `cheat-sheet.md` ("GPT-5 is the turning point") is an opinion/observation, not a platform fact. Acceptable in context but worth flagging as subjective.
- The "March 2026" date stamps on `cheat-sheet.md` and `part5-gotchas-bugs.md` are current. Other files lack date stamps — consider adding them to help users assess freshness.
- The Dataverse MCP 403 troubleshooting guide in `troubleshooting.md` is detailed and actionable — this is the kind of unique, hard-won knowledge that makes the knowledge base valuable.
- The "Live Fetch + Static Fallback" pattern in `knowledge-sources.md` is a novel architectural pattern not documented elsewhere. High value.

---

## 7. Token Budget Consideration

These files are injected into Copilot context. Current estimated sizes:

| Category       | File count | Est. total tokens |
| -------------- | ---------- | ----------------- |
| Knowledge      | 9          | ~18,000           |
| Best practices | 5          | ~17,000           |
| **Total**      | **14**     | **~35,000**       |

The duplication identified above accounts for roughly 4,000–6,000 tokens of redundant content. Trimming `cheat-sheet.md` to a quick-reference format would recover the most space (~2,000–3,000 tokens) while losing no unique information.
