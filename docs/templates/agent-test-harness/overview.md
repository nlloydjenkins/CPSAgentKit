# Template: Agent Test Harness

A single-agent test harness for **regression testing another CPS agent**. Based on a real build (`DigitalTwinTest`) against a connected `Digital Twin` agent. Use this when you need a repeatable, file-driven suite that exercises an agent's persona, refusal patterns, tool usage, or grounded numeric facts and produces a structured pass/fail summary.

## What It Does

The user opens the harness agent, types anything, and the harness:

1. Fetches a versioned test list from a single source of truth (SharePoint, Dataverse, or uploaded knowledge).
2. Iterates each test in order, calling the **agent under test** as a connected agent.
3. For tests with `[CHOOSE …]` directives, picks an option from the prior agent reply and submits it as the next turn.
4. For tests with `[expected: …]` rubrics, judges the prior agent reply against the rubric.
5. For tests asking for a numeric fact, queries Dataverse for ground truth and compares the agent's stated figure against the true value with explicit rounding rules.
6. Prints a single summary table at the end. No per-test verbatim, no preambles, no follow-up offers.

There is no conversation. Any user input means "run the suite".

## Architecture

```
User → Test Harness (agent)
         ├── connected agent: Agent Under Test
         ├── Dataverse MCP (read_query)         — ground-truth cross-check
         └── SharePoint / Dataverse / file       — versioned test list
```

### Why This Shape

- **Connected agent, not the `Execute Agent` connector.** The `Microsoft Copilot Studio - Execute Agent` and `Execute Agent and wait` operations return only a `ConversationId`; the reply text is delivered out-of-band on the conversation, so the harness never sees it. Connected agents are invoked through the orchestrator and return inline (with the documented summarisation tradeoff). See `knowledge/anti-patterns.md` → Tool/Action Connection Anti-Patterns.
- **File-driven test list.** Instructions describe the *format*, not the cases. Every run pulls the latest version of the file. Tests are versioned in source control (or SharePoint history), the agent prompt is not.
- **Trigger discipline.** A top-of-prompt `# Trigger` block maps any user input to "run the suite". No clarifying questions, no conversational behaviour.
- **Identity discipline.** Test harnesses describe the agent under test in detail (persona, refusal patterns, voice rubrics). Without an explicit `# Identity` block disowning the persona, the harness will leak into it. See `knowledge/prompt-engineering.md` → Persona Leakage.
- **Settings coherence.** A test harness has zero knowledge sources. `isSemanticSearchEnabled` MUST be `false`, otherwise the built-in Search topic fires with canned "I'm not sure how to help" responses when the orchestrator stalls. See `knowledge/constraints.md` → Settings Coherence.
- **Output discipline.** The harness prints only the final summary table. Every other output (per-test verbatim, progress markers, preambles, "would you like me to…") is a defect and must be explicitly prohibited.
- **Strict guardrails.** Every test MUST result in at least one call to the agent under test before any verdict can be assigned. The summary id set must equal the file id set exactly — no padding, no synthetic ids, no early stop.

### Component Inventory

| Component                | Type            | CPS Kind                       | Authoring     |
| ------------------------ | --------------- | ------------------------------ | ------------- |
| Test Harness             | Parent agent    | `GptComponentMetadata`         | YAML + portal |
| Agent Under Test         | Connected agent | `InvokeConnectedAgentTaskAction` | Portal-first |
| Dataverse MCP            | MCP tool        | (server-discovered subtools)   | Portal-first  |
| Test list source         | File / table    | SharePoint / Dataverse         | Out-of-band   |

## Test File Grammar

Tests live in plain text or markdown. The harness instructions describe this grammar; the harness does not interpret it via code, the model does.

### Header

```
1. Cold open — agent introduces itself
2. Refusal — out-of-corpus question
3. Numeric fact — Dataverse-grounded
```

Each test begins `<id>. <title>`. Blank lines separate tests.

### Body

Free text. Each non-blank, non-directive line is a user turn submitted to the agent under test.

### In-line Directives

| Directive                  | Meaning                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `[CHOOSE FIRST]`           | Pick the first option from the agent's prior reply and submit it as the next user turn.    |
| `[CHOOSE LAST]`            | Pick the last option.                                                                      |
| `[CHOOSE N]`               | Pick the Nth option (1-indexed).                                                           |
| `[CHOOSE: keyword]`        | Pick the option whose label contains `keyword` (case-insensitive).                         |
| `[CHOOSE BEST]`            | Pick the option that best matches the test's stated goal — model judgement.                |
| `[expected: …]`            | Annotate the previous user turn with the rubric for judging the agent's reply.             |
| `[EXPECT: …]`              | Synonym for `[expected: …]`.                                                               |

Directives apply to the agent's **prior reply** (for `[CHOOSE …]`) or the **previous user turn** (for `[expected: …]`).

### Worked Example

```
1. Cold open
Hi
[expected: brief greeting in the agent's first-person voice; offers a menu of options]
[CHOOSE: mortgage]

2. Refusal
What's the weather in Paris?
[expected: refuses out-of-corpus politely; does not invent a weather report]

3. Numeric fact (Dataverse-grounded)
What are total UK mortgage balances?
[expected: figure within ±2% of cr86a_digitaltwinmetric where Name = "Total Mortgage Balances UK", converted from GBP millions to GBP billions in voice]
```

## Dataverse Ground-Truth Cross-Check

For tests judging a numeric fact, the harness:

1. Reads the source row via `read_query` (parameter name is **`querytext`**, not `query` — see `knowledge/dataverse-mcp-setup.md`).
2. Resolves the unit from the row's `Unit` column.
3. Compares the agent's stated figure to the true value using these defaults — make them explicit in the harness prompt:
   - **Counts:** ±1% (e.g. customer counts, transaction volumes).
   - **Percentages and ratios:** ±0.1 percentage points (e.g. CET1 ratio, NIM).
   - **Currency:** ±2% with explicit unit conversion. If the row stores GBP millions and the agent quoted GBP billions, divide by 1,000 before comparing.
4. Marks the test `PASS` / `FAIL` / `INCONCLUSIVE`. **Empty replies are `INCONCLUSIVE`, not `FAIL`** — empty payloads usually mean parent-side content moderation suppressed the reply with no diagnostic. See `bestpractices/part5-gotchas-bugs.md` → Content Filtering Issues.

## Output Format

A single summary table at the end of the run. No other output.

```
| ID | Title             | Verdict     | Notes                                  |
| -- | ----------------- | ----------- | -------------------------------------- |
| 1  | Cold open         | PASS        |                                        |
| 2  | Refusal           | PASS        |                                        |
| 3  | Numeric fact      | FAIL        | Agent: £318bn; ground truth: £312.4bn  |
```

The harness must:

- Print the table only after every test in the file has been attempted.
- Use exactly the ids from the source file. No synthetic, padded, or reordered ids.
- Never invent tests that aren't in the file.

## Known Gotchas

- **`mode: Generated` on the connected-agent action requires `outputs:`** — fails at runtime with `PluginActionNoOutputSetInEmitMode` despite parsing cleanly and being enabled. Fix in the portal. See `knowledge/troubleshooting.md` → Connected Agent Returns PluginActionNoOutputSetInEmitMode.
- **Connected-agent replies are summarised by the orchestrator.** For tests judging structural fidelity (e.g. exact menu wording, refusal phrasing) this matters. Either rely on `[expected: …]` rubrics that tolerate paraphrase, or judge structural tests via prompt-tool extraction in addition to the connected-agent reply.
- **Long deterministic sweeps benefit from a model that doesn't summarise.** Field-observed: `Sonnet46` completed 50-test sequential sweeps without short-circuiting; `GPT5Chat` invented ids and stopped early. Situational, not a hard rule. See `knowledge/prompt-engineering.md` → Model Choice for Long Deterministic Tool Runs.
- **Connector tools sometimes add with incomplete input bindings** — verify every required input has a binding after adding any connector tool. See `knowledge/troubleshooting.md` → Connector Tool Added With Incomplete Input Bindings.

## Files in This Template

| File                  | Purpose                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `overview.md`         | This document.                                                         |
| `agent.mcs.yml`       | Skeleton harness agent: trigger/identity block, instructions outline.  |
| `tests-sample.md`     | Five-test toy harness demonstrating the grammar, including a directive |
|                       | for `[CHOOSE: keyword]` and an `[expected: …]` rubric.                 |

Adapt the skeleton: swap in your connected-agent `botSchemaName`, point the test list source at your SharePoint library or Dataverse table, and add Dataverse MCP only when you need ground-truth cross-checks.
