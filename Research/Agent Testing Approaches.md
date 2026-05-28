# Research: Testing Copilot Studio Agents via Agent Workbench

**Status:** Draft research — technical + business evaluation
**Date:** 2026-05-18
**Owner:** Agent Workbench
**Goal:** Decide how Agent Workbench should help makers *test and evaluate* a Copilot Studio (CPS) agent they've built. Two candidate approaches are on the table; this document compares them technically and commercially, and then makes a recommendation.

---

## 1. Problem Statement

Agent Workbench already helps makers **design, build, and review** CPS agents. The missing leg of the stool is **automated testing and evaluation**:

- Send a curated suite of test utterances to a published agent.
- Capture its responses (and, where possible, tool calls / topic transitions).
- Score those responses against expected behaviour — correctness, tone, grounding, brand alignment, refusal behaviour, etc.
- Produce a repeatable pass/fail / scored report so makers can iterate with confidence and gate releases.

Two architectural options are under consideration.

---

## 2. Candidate Approaches

### Option A — In-Agent Evaluator (Child Agent / Topic)

The evaluator lives **inside** the same CPS agent (or as a child agent / multi-agent peer) that is being tested.

- A dedicated topic or child agent receives the user turn, invokes the production logic, captures the response, and then runs evaluation prompts against it.
- Verdicts can be written back to Dataverse, surfaced as agent output, or emitted via a custom action.
- "Self-eval" loop entirely inside Copilot Studio runtime.

### Option B — External Harness via Direct Line + Azure OpenAI / Evaluator Agent

The evaluator lives **outside** the agent under test.

- A harness (Node/Python, run locally, in CI, or as an Azure Function) authenticates to the Direct Line / Dataverse-backed conversations API (see [docs/knowledge/direct-line-api.md](docs/knowledge/direct-line-api.md)).
- For each test case it: creates a conversation, sends utterances, captures activities, then sends `(input, expected, actual)` to **Azure OpenAI** (or a second CPS evaluator agent reached via Direct Line) for scoring.
- Results are written to a report (markdown / JSON / Foundry eval dataset).

---

## 3. Technical Evaluation

### 3.1 Capability Matrix

| Capability | A — In-Agent | B — Direct Line + AOAI |
|---|---|---|
| Reuses production agent unchanged | Partial — needs added topic/child wiring | Yes — agent is treated as a black box |
| Access to internal state (variables, slots, topic trace) | High — same runtime | Low — only what activities expose |
| Access to tool call payloads | Medium — visible to child topic if surfaced | Low — only via activities/trace events if emitted |
| Deterministic / reproducible runs | Low — same session, prompt order matters, shared context | High — fresh conversation per test, isolated |
| Parallelism | Low — single conversation context per user | High — many conversations in parallel |
| CI/CD integration | Weak — must drive via portal or Direct Line anyway to kick it off | Strong — pure code, runs in any pipeline |
| Independence of judge from system under test | **Low — judge shares model, instructions, governance, and possibly knowledge** | **High — judge is a separate model/agent** |
| Risk of judge contamination (same model rationalising its own output) | High | Low |
| Multi-turn / scenario testing | Medium — easy intra-session, hard across sessions | High — harness controls turn-by-turn |
| Evaluation model choice (e.g. GPT-4o vs o-series vs custom rubric) | Constrained to what CPS prompt nodes / connected models allow | Free — any AOAI deployment, any rubric, structured outputs |
| Latency / cost per test | Higher per turn (extra LLM hop inside the agent) | Comparable; can batch and use cheaper judge model |
| Capture of citations / grounding for scoring | Limited — must be surfaced into a variable | Full — citations come back on activities |
| Lifecycle / publish dependency | Evaluator ships *with* the agent — every eval change = republish | Independent — eval rubric changes don't touch the agent |
| Brand / safety regression testing | Awkward — evaluator inherits same guardrails it's testing | Clean — external judge with own rubric |
| Foundry continuous-eval / dataset reuse | Hard — no clean trace export | Natural fit — can stream `(input, output, scores)` into Foundry eval datasets |
| Maker skill required | Low (just CPS authoring) | Medium (auth, scripting, Azure resources) |
| Works for declarative agents / M365 Copilot agents | No — those don't have the same topic model | Yes — Direct Line / equivalent APIs |

### 3.2 Architecture Notes

**Option A — In-Agent**

- Implementation patterns:
  - Child agent named `Evaluator` invoked by the parent after each test scenario.
  - Or a `Test Harness` topic gated behind a magic phrase or auth claim.
- Hard problems:
  - **Judge independence.** The evaluator runs in the same governance/safety envelope as the agent. If the agent refuses, the evaluator also can't reason about the refusal cleanly.
  - **State bleed.** Earlier test turns contaminate later ones unless every test resets the conversation — which Direct Line does naturally but in-agent does not.
  - **Tool calls.** Most tool/connector results aren't natively exposed to a sibling topic; capturing them requires explicit variable plumbing in every topic, which is invasive.
  - **Shipping risk.** Test scaffolding lives in the production solution. Forgetting to disable it leaks an evaluator surface to end users.

**Option B — Direct Line Harness**

- Implementation patterns (already partly proven in this repo):
  - MSAL device-code or client-credentials → `api.powerplatform.com/.default` token.
  - `POST .../bots/<schema>/conversations` to start, then per-turn POSTs.
  - Activities contain text, suggested actions, citations, and (where enabled) trace events.
  - Judge step: Azure OpenAI chat completion with a structured-output rubric, OR a second CPS agent reached over Direct Line for an "LLM-as-judge" peer agent that itself is versioned with the harness.
- Hard problems:
  - **Auth UX** for first-time makers (mitigated by Agent Workbench owning the App Registration steps; we already document them).
  - **Agent must be published** before each test cycle — naturally enforced by `Apply Changes` flow.
  - **Trace richness depends on what the agent emits** — we can't see internal variables unless the agent chooses to surface them.
  - **Cost of judge calls** — controllable via model choice and batching.

### 3.3 Fit with Agent Workbench Today

- Agent Workbench already encodes the Direct Line auth, conversation, and turn pattern in [docs/knowledge/direct-line-api.md](docs/knowledge/direct-line-api.md) and is referenced from build/troubleshooting flows.
- Agent Workbench already understands CPS solution YAML, prompt configs, and best-practice review — meaning the harness can be **generated** from the same metadata that the build flow uses (topics, expected tools, knowledge sources).
- Multi-agent and evaluator patterns are already documented in [docs/knowledge/multi-agent-patterns.md](docs/knowledge/multi-agent-patterns.md) and [docs/bestpractices/part4-tools-multiagent.md](docs/bestpractices/part4-tools-multiagent.md). The "LLM-as-judge" pattern explicitly recommends a *separate* judge — pushing us toward Option B.
- Foundry alignment: [docs/foundry/evaluation.md](docs/foundry/evaluation.md) describes batch + continuous eval using external datasets. Option B drops directly into that pipeline; Option A does not.

### 3.4 Technical Verdict

**Option B is technically superior** on the dimensions that matter for an evaluation harness: judge independence, reproducibility, parallelism, CI/CD fit, foundry/eval pipeline reuse, and minimal contamination of the agent under test. Option A's only genuine technical advantage — access to internal state — is partially recoverable in B by having the agent emit structured trace activities, and is rarely worth the cost of polluting the production agent with test infrastructure.

---

## 4. Business Evaluation

### 4.1 Cost

| Cost driver | A — In-Agent | B — Direct Line + AOAI |
|---|---|---|
| Build effort in Agent Workbench | Medium — generate eval topics/child agent | Medium — generate harness + report; auth already documented |
| Maker onboarding effort | Low (CPS-only) | Medium (one-time App Registration; Agent Workbench can automate) |
| Per-test runtime cost | 1× agent turn + 1× internal judge turn (inside CPS quota) | 1× agent turn (CPS) + 1× AOAI judge call (cheap if `gpt-4o-mini`-class) |
| Quota / capacity risk | Consumes CPS message quota for both halves of every test | Splits load: agent quota for the run, AOAI tokens for the judge |
| Recurring maintenance | High — eval logic ships with every agent release | Low — harness/rubric versioned separately from agent |

### 4.2 Value to the Maker

- **Confidence to ship.** Option B produces a CI-friendly report — directly answers "is it safe to publish?". Option A produces in-portal output that's harder to gate releases on.
- **Regression testing across versions.** Option B can run the same suite against `dev` and `prod` agents and diff scores. Option A cannot easily test two versions in parallel.
- **Brand and safety review** (cf. CR005 brand/editor feedback review). An independent judge is far more credible to compliance/brand reviewers than a self-grader.
- **Re-usability.** A harness built for one agent generalises to all of a customer's CPS agents (and to declarative / M365 agents). An in-agent evaluator only tests itself.

### 4.3 Risk

| Risk | A | B |
|---|---|---|
| Test scaffolding leaks to end users | **High** | Low (separate process) |
| Self-grading bias inflates scores | **High** | Low |
| Vendor lock to a single CPS feature surface | High | Low — moves with the platform |
| Auth setup blocks adoption | Low | Medium — but one-time and automatable |
| Maker abandons testing because it's "in the way" | Medium (couples eval to publish cycle) | Low (runs out-of-band) |

### 4.4 Strategic Fit

Agent Workbench's stated principle is to help makers reach a *complete working agent*, not just produce advice. A first-class external harness:

- Slots into Init → Build → **Test** → Review → Publish as a discrete phase.
- Reuses Agent Workbench's existing knowledge of topics, tools, and knowledge sources to **auto-generate** test cases.
- Aligns with the Foundry direction documented under `docs/foundry/` (batch + continuous eval, prompt optimizer feedback loops).

### 4.5 Business Verdict

Option B is the better business bet: lower long-term maintenance, lower release risk, higher credibility of results, reusable across agents and across the CPS → Foundry path the docs already describe. Option A is cheaper to *start* but accrues technical and governance debt with every agent that adopts it.

---

## 5. Recommended Approach

**Adopt Option B as the primary testing path in Agent Workbench**, with a narrow, optional role for Option A.

### 5.1 Primary: External Direct Line Harness with AOAI Judge

Agent Workbench should ship a **Test Agent** capability that:

1. **Generates a test suite** from the CPS solution it already parses — one scenario per topic / use case, plus brand/safety/refusal probes derived from `docs/bestpractices/part5-gotchas-bugs.md` and the active use case (e.g. `docs/use-cases/06-financial-advice-pack-review/`).
2. **Runs the suite via Direct Line** using the documented auth pattern, one fresh conversation per scenario, in parallel where safe.
3. **Scores with Azure OpenAI** using a structured-output rubric: correctness, grounding/citation, tone/brand, refusal correctness, tool-call expectations. Rubric is versioned in the repo, not in the agent.
4. **Optionally uses a second CPS agent as judge** (also reached via Direct Line) when the customer wants an in-tenant judge for data-residency or governance reasons — same rubric, different host.
5. **Emits a report** (markdown + JSON) suitable for PR review, CI gates, and Foundry continuous-eval dataset ingestion.

### 5.2 Optional Supplement: In-Agent "Trace Surface" Topic (NOT full Option A)

To recover the one genuine advantage of Option A — visibility into internal state — add a **non-judging** trace topic that, when invoked under a test claim/header, emits structured trace activities (active topic, last tool called, retrieved knowledge IDs) back through Direct Line. The harness consumes these; **scoring still happens externally**. This is small, optional, and avoids self-grading.

### 5.3 Out of Scope (for this round)

- Full self-evaluating child agent as the default pattern (rejected — see §3 and §4).
- Replacing Foundry continuous eval; the harness should *feed* it, not replace it.
- UI test recording / playback in the CPS portal — separate workstream.

### 5.4 Next Steps

1. Spike: extend `scripts/` with a `cps-test` harness using the existing Direct Line documentation; validate against the demo agent.
2. Define the rubric schema (JSON) and store under `templates/` so it ships with init/sync.
3. Add a `Test Agent` command surface to the extension (`packages/extension/src/commands/`) wired to the harness.
4. Author `docs/knowledge/agent-testing.md` covering the harness, auth, rubric, and CI integration.
5. Pilot with use case 06 (financial advice pack review) — its brand/compliance focus is the strongest case for an independent judge.

---

## 6. Open Questions

- Should the judge be a single AOAI deployment owned by the maker, or should Agent Workbench support both AOAI and "judge-as-CPS-agent" out of the box from day one?
- For unattended CI, do we standardise on client-credentials flow (requires admin to grant app-only Power Platform access) or stick with device-code + cached refresh tokens?
- How do we represent "expected tool call" in a test case when Direct Line trace events are not guaranteed to expose tool payloads on every channel?
- Where does cost ownership land — maker's AOAI subscription, Agent Workbench-provided sample deployment, or both supported?
