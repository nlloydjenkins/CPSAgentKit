# Use Case 6 — Financial Advice Document Pack Suitability Reviewer

## Background

Helios Wealth Management is a UK IFA firm with 140 advisers across 14 offices. Advisers produce a "document pack" for each client recommendation — typically a Suitability Report, a Fact Find, an Attitude to Risk assessment, a Costs & Charges disclosure, and a product illustration. Every pack must be reviewed by a compliance supervisor against the FCA Consumer Duty rules, the firm's own suitability policy, and a detailed grading rubric before the adviser can issue it to the client.

Supervisors currently spend 45–90 minutes per pack. First-pass rejection rate is 35%. The target is a 10-minute agent-assisted pre-check that produces a structured suitability report the supervisor reviews and countersigns.

The agent does **not** replace the supervisor's sign-off — it produces a grounded, criterion-by-criterion suitability assessment that the supervisor reviews, corrects, and approves. Every rule, disclosure, and grading decision is grounded in the firm's knowledge base, never in model general knowledge.

## Build-Time Configuration

The Helios/sample values are placeholders. During Build, CPSAgentKit must ask the maker to confirm or replace tenant-specific values before finalising tenant-bound schema names, prompt instructions, connector descriptions, uploaded knowledge targets, or portal setup steps. Missing values should block only the specific tenant-bound action that needs them; Build should still perform safe work that does not depend on those values:

- Firm name, adviser population, office list, and Teams publishing target
- Compliance supervisor Teams team/channel, default `#compliance-supervisors`
- File-staging path or upload location for the five knowledge documents that will be uploaded directly to Copilot Studio
- Dataverse publisher prefix/table name if not using `cr85a_packreview`
- Retention period, row-level-security model, and model-driven app owner
- Accepted advice types, escalation advice types, and compliance sign-off owner
- File-size limits and preferred document-conversion path if code interpreter is insufficient

## Primary Users and Channel

- **Advisers** — upload a document pack via Microsoft Teams chat, receive the suitability report back in the same conversation
- **Compliance supervisors** — receive a notification (Teams channel post) when an `ESCALATE` verdict is produced; review the full report in a Dataverse-backed model-driven app
- Authenticated via Microsoft Entra ID — no anonymous access

This solution uses a **single parent agent** with a **topic-owned linear pipeline** of prompt tools (per `pipeline-patterns.md` → Topic-Owned Linear Pipeline). Generative orchestration is not used between stages — the pipeline runs as a deterministic sequence inside one adaptive-dialog topic. This is the only reliable way to preserve strict structured output (numbered criteria, labeled blocks, per-rule verdicts) across multiple assessment stages.

## What the Solution Should Do

1. **Accept a document pack upload** in Teams chat. Supported inputs:
   - Direct file upload (PDF or DOCX, up to 5 files per pack, each ≤ 5 MB to stay within connector payload limits)
   - A SharePoint folder URL containing the pack (all files in the folder are pulled) — source pack only; not a knowledge source
2. **Preprocess uploads** via a **prompt tool with code interpreter** (stdlib-only sandbox — no `bs4`, no `pandas`). Converts each PDF/DOCX to text/Markdown, merges into a single canonical document with section markers (`## Suitability Report`, `## Fact Find`, `## ATR`, `## Costs & Charges`, `## Illustration`). The merged text becomes the canonical input for every downstream stage. If any file fails to convert, the pipeline stops and asks the adviser for a text-based replacement.
3. **Classify the pack** via the **Pack Classifier prompt tool** — identify: advice type (pension transfer / ISA / GIA / drawdown / protection / mortgage), client segment (retail / professional / vulnerable), and recommended product(s). Output is JSON captured via `predictionOutput`.
4. **Assess against Consumer Duty rules** via the **Consumer Duty Evaluator prompt tool** — 4 outcomes (Products & Services, Price & Value, Consumer Understanding, Consumer Support). Each outcome has a fixed set of criteria scored RAG (Red / Amber / Green) with a one-sentence evidence citation from the pack. Output is a labeled block `CD_RAW` with a strict numbered template.
5. **Assess against firm suitability policy** via the **Suitability Policy Evaluator prompt tool** — 12 criteria from the firm's policy (e.g. risk capacity confirmed, ATR documented, existing arrangements considered, charges comparison shown, pension transfer analysis where applicable). Each scored RAG with evidence. Output labeled block `SP_RAW`.
6. **Apply the grading rubric** via the **Grading Rubric prompt tool** — produces a weighted score (0–100) per pillar: Client Understanding (25), Recommendation Justification (25), Risk Alignment (20), Cost Transparency (15), Documentation Completeness (15). Weights come from the rubric knowledge document, not the prompt. Output labeled block `GR_RAW`.
7. **Check disclosures and declarations** via the **Disclosure Checker prompt tool** — verifies required disclosures are present and correctly worded (cancellation rights, complaints handling, FSCS protection, adviser charging structure, conflicts of interest). Output labeled block `DC_RAW`.
8. **Validate structural completeness** via a **Validator prompt tool** — checks each prior block has the expected number of criteria, each criterion has a verdict and evidence citation, and no block has been compressed into a narrative summary. If validation fails, flag `DETAIL_INCOMPLETE` and re-run the offending stage once before escalating.
9. **Assemble the suitability report** via the **Reporter prompt tool** — consumes `CD_RAW`, `SP_RAW`, `GR_RAW`, `DC_RAW` verbatim and produces the final report with: overall verdict (`APPROVE` / `APPROVE_WITH_CHANGES` / `ESCALATE`), top 3 issues, top 3 strengths, required remediations, and the full criterion-by-criterion detail. The Reporter is explicitly instructed to reproduce labeled block content before adding any summary.
10. **Log the assessment** in Dataverse (`cr85a_packreview` table) via a pre-bound "Add a new row" connector action: adviser email, client reference, pack classification, four pillar scores, overall verdict, raw labeled blocks as long-text fields, audit timestamp, agent version stamp.
11. **Route based on verdict:**

- `APPROVE` → report shown in chat; no supervisor notification
- `APPROVE_WITH_CHANGES` → report shown in chat with required remediations highlighted; no escalation
- `ESCALATE` → report shown in chat **and** Teams channel post to `#compliance-supervisors` with Dataverse record link

12. **Allow follow-up questions** on the produced report within the same conversation ("Why did Cost Transparency score amber?") by re-querying the stored raw blocks from the current topic variables. Do not re-run the pipeline.

## What the Solution Should NOT Do

- Countersign, approve, or issue the pack to the client — only the human supervisor can do this
- Use general model knowledge for any compliance, regulatory, grading, or disclosure decision — every verdict must cite evidence from the pack and reference the rule / policy / rubric from knowledge
- Fabricate disclosure wording or regulatory references — missing disclosures are flagged as issues, never invented
- Re-score or change verdicts in response to adviser push-back — the adviser can request supervisor review, not agent revision
- Paraphrase or summarise the labeled blocks in the stored Dataverse record — raw blocks are the audit trail
- Accept packs missing the Fact Find or the Suitability Report — those are hard requirements; stop and ask
- Process non-English packs — generative orchestration is English-only
- Expose the raw labeled blocks, internal pipeline stage names, or agent version stamp to the adviser in the chat output (they are audit-internal)
- Offer to "try again" with different inputs if validation fails twice — escalate to a supervisor instead

## Success Criteria

- 80% of complete document packs produce a full suitability report within 10 minutes of upload
- Every `ESCALATE` verdict is accompanied by a Teams channel post to `#compliance-supervisors` within 30 seconds
- Every stored report in Dataverse has all four raw blocks present, each with the expected number of criteria (Validator catches compression before it reaches the user)
- Supervisor-reported false-clear rate below 5% (supervisor finds a material issue the agent missed) measured monthly against a sample
- Supervisor review time drops from 45–90 minutes to 15–20 minutes per pack
- Zero packs stored with text-label choice column values (all choice fields use integer mappings verified in the live schema)
- Zero packs approved by the agent alone — every issued pack has a supervisor sign-off in the model-driven app

## Systems and Tools

- **Channel:** Microsoft Teams (agent published to Teams)
- **Authentication:** Microsoft Entra ID (user authentication)
- **File preprocessing:** prompt tool with code interpreter (stdlib-only — conversion via `pdf` stdlib parsing limited; recommend in-tenant document conversion via Power Automate flow calling Graph's file preview or a Foundry-hosted PDF extraction service if stdlib is insufficient, then return text to the agent)
- **Pipeline stages (all prompt tools, invoked from a single `AdaptiveDialog` topic on the parent):** Pack Classifier, Consumer Duty Evaluator, Suitability Policy Evaluator, Grading Rubric, Disclosure Checker, Validator, Reporter. Each returns JSON via `predictionOutput`, parsed with `Text(ParseJSON(JSON(Topic.RawX)).text)`.
- **Knowledge sources (uploaded directly to Copilot Studio, each scoped to the prompt tool that uses it):**
  - `consumer-duty-rules.md` — FCA Consumer Duty PRIN 2A outcomes, cross-cutting rules, required behaviours → scoped to Consumer Duty Evaluator
  - `firm-suitability-policy.md` — Helios internal suitability policy, 12 criteria with evidence requirements → scoped to Suitability Policy Evaluator
  - `grading-rubric.md` — 5-pillar weighted rubric with worked examples of RAG thresholds → scoped to Grading Rubric
  - `required-disclosures.md` — prescribed disclosure wording and regulatory references (cancellation, complaints, FSCS, charging, conflicts) → scoped to Disclosure Checker
  - `advice-type-taxonomy.md` — advice type definitions and which additional rules apply per type → scoped to Pack Classifier and Suitability Policy Evaluator
- **Audit store:** Dataverse — `cr85a_packreview` table via pre-bound "Add a new row" connector action. Choice columns for Verdict (`APPROVE=100000000`, `APPROVE_WITH_CHANGES=100000001`, `ESCALATE=100000002`) and AdviceType — integer mappings verified against the live schema.
- **Escalation:** Microsoft Teams — Post message to `#compliance-supervisors` channel with a deep link to the Dataverse record

## Platform Considerations

- **Topic-owned linear pipeline, prompt tools only.** Every stage is a prompt tool invoked from a single `AdaptiveDialog` topic on the parent — no child agents. This is the only reliable pattern for multi-stage structured output (empirically verified: child agents recover ~30–50% criterion detail; prompt tools recover 100%). See `pipeline-patterns.md`.
- **Four-action specialist pattern per stage:** `SendActivity` (progress) → `InvokeAIBuilderModelAction` (prompt tool, `predictionOutput` → `Topic.RawX`) → `SetVariable` (`Topic.XText = Text(ParseJSON(JSON(Topic.RawX)).text)`) → `SetVariable` (`Topic.XBlock = Concatenate("X_RAW", Char(10), Char(10), Topic.XText)`).
- **Labeled output blocks.** Each evaluator outputs a distinct label prefix (`CD_RAW`, `SP_RAW`, `GR_RAW`, `DC_RAW`). The Reporter instruction explicitly states: "Preserve each specialist's returned output exactly as received. Do not summarise, compress, or rewrite any labeled block."
- **Validator is mandatory.** Structural validation catches silent detail compression before it reaches the user. Hard rule: "Consumer Duty must show 4 outcomes × N criteria. Suitability must show 12 criteria. Grading must show 5 pillars. Disclosures must show the full checklist. If counts are wrong, flag `DETAIL_INCOMPLETE` and re-run that stage once, then escalate."
- **Version stamp every agent update.** Include a version string in agent instructions and require it in every stored report (`Topic.AgentVersion`). Without this, regression detection is guesswork.
- **File processing is mandatory before assessment.** No downstream stage may reason about the raw uploaded file — every stage works from the preprocessed text in `Global.DocText`. Reinforce this in every prompt tool's instructions: "The content below was converted from the uploaded document. Do not reference the original file format or attempt to access the raw file."
- **Code interpreter sandbox is stdlib-only.** If the PDF conversion step needs anything beyond `json`, `re`, `string`, `xml`, standard archive libs, it WILL crash with `No module named 'X'`. Options: (a) keep conversion stdlib-only with accepted limitations, (b) route conversion via a Power Automate flow that calls Graph `driveItem` content endpoints to fetch preformatted text, (c) call an external extraction service as an HTTP action.
- **Connector payload limits.** 5 MB public cloud, 450 KB GCC. Large document packs may exceed this — chunk in the preprocessing stage or fetch the source pack from its SharePoint folder rather than routing the whole file through connector payload.
- **Source-pack file size note.** Knowledge documents are uploaded directly to Copilot Studio, so SharePoint indexing limits do not apply to them. The source advice pack itself, when fetched from a SharePoint folder, is still subject to the 7 MB silent-skip limit without an M365 Copilot license. If packs routinely exceed 7 MB, compress/split the source pack or require M365 Copilot licensing for the advisers who upload them.
- **Dataverse text column length.** Raw labeled blocks are long — configure the relevant `cr85a_packreview` text columns with appropriate `max_length` (4000 characters is the typical Dataverse ceiling for single-line text; use a multi-line text column or multiple columns for full raw blocks). HTTP 400 from the connector on write = exceeded column length.
- **Dataverse choice columns require integer values.** Verdict, AdviceType, ClientSegment must all be passed as integers — never text labels — in both the MCP/connector input descriptions and the Reporter prompt's output contract.
- **Every dynamic connector input needs a description** stating value source ("from the Reporter output"), format, and (for autonomous extensions) "never ask the user". This is user-interactive, so prompts are acceptable, but missing descriptions still cause mis-routing.
- **Anti-termination instructions required.** Between stages, add per-stage suppression ("Do NOT show this output to the user — proceed to stage N"). The orchestrator treats any stage output as a potential final answer otherwise.
- **Content moderation: Low.** Financial advice, regulatory, and complaints wording triggers false positives at Medium/High. Set in the CPS portal (manual portal step — no YAML field).
- **General knowledge: disabled. Web browsing: disabled.** The instruction "Always use the firm's knowledge documents and the uploaded pack. Do not use general knowledge for any compliance, regulatory, grading, or disclosure decision." must be explicit and repeated per prompt tool.
- **Prompt tools are text-in, text-out only.** The final report is rendered as Markdown in Teams; adaptive cards for the escalation post, but the assessment itself is Markdown.
- **10-turn history limit.** Store the pack classification, raw blocks, and final report in topic / global variables — follow-up questions read from variables, not conversation history.
- **Testing credits.** Embedded test chat messages are free, but prompt tool executions consume Copilot Credits during testing. Factor this into iteration budgets — each end-to-end run invokes 7 prompt tools.

## Tone and Behaviour

- Supervisory and precise — this is a compliance artefact, not a conversational response
- Every verdict cites specific evidence from the pack ("Risk capacity confirmed in Fact Find §4.2" not "Risk capacity is documented")
- Every amber or red uses the exact rule / criterion wording from the knowledge document, not paraphrase
- Never soften a red verdict ("significant concern" not "minor issue")
- Never volunteer advice on how to rewrite the pack — issues are listed, remediation is the adviser's job
- Never reveal internal pipeline stage names, version stamps, or labeled block prefixes to the adviser
- If evidence is missing for a criterion, verdict is Red and the evidence field states "Not found in pack" — never fabricated

## Language and Compliance

- English only
- Every pack review logged in Dataverse with full raw blocks for 7 years minimum (financial services retention requirement)
- Per-adviser data isolation — advisers can only view reviews they produced (Dataverse row-level security via business units)
- Content moderation: **Low** (required for regulatory and complaints-handling wording)
- General knowledge: disabled. Web browsing: disabled. All content grounded in uploaded pack + firm knowledge documents.
- Agent version stamp (e.g. `v1.4.2`) included in every stored report for regression tracking
- No personal client data leaves the Microsoft tenant — all processing via in-tenant connectors and Dataverse

## Sample Interaction

**1. Full pack review**

> Adviser: [uploads 5-file pack] Please review this pack for Mrs Chen's pension transfer.
> Agent: "Preprocessing 5 files..." → "Classifying pack..." → "Evaluating Consumer Duty..." → "Evaluating suitability policy..." → "Applying grading rubric..." → "Checking disclosures..." → "Validating structure..." → "Assembling report..."
>
> **Suitability Pre-Check Report — Mrs K. Chen — Pension Transfer**
>
> **Overall verdict:** APPROVE_WITH_CHANGES
> **Pillar scores:** Client Understanding 22/25 | Justification 18/25 | Risk Alignment 18/20 | Cost Transparency 9/15 | Documentation 13/15 — Total 80/100
>
> **Top 3 issues:**
>
> 1. 🟠 Cost comparison to existing arrangement missing the 10-year projection required by firm policy §3.4
> 2. 🟠 FSCS protection disclosure present but refers to the previous 2023 limit (should be £85,000 per institution as of April 2024)
> 3. 🟢 Consumer Duty "Price & Value" outcome evidence light — criterion 2b cites product literature, not adviser analysis
>
> **Top 3 strengths:**
>
> 1. 🟢 ATR fully documented with capacity for loss analysis
> 2. 🟢 Existing arrangement considered and compared
> 3. 🟢 Cancellation rights and complaints procedure disclosures present and correctly worded
>
> **Required remediations before issuing:** [full list]
>
> **Criterion-by-criterion detail:** [full structured breakdown]

**2. Follow-up question**

> Adviser: Why did Cost Transparency only score 9/15?
> Agent: [reads stored raw blocks from topic variables, not re-running pipeline] "Cost Transparency lost 3 points on criterion CT-2 (missing 10-year projection, firm policy §3.4) and 3 points on criterion CT-5 (charging structure shown as percentage only, not cash equivalent per FCA PS22/9). The criteria passed were CT-1, CT-3, CT-4."

**3. Incomplete pack**

> Adviser: [uploads 2 files, missing Fact Find]
> Agent: "I can't run a suitability review without a Fact Find. Please upload a Fact Find document and the full pack, then try again. A complete pack must include: Fact Find, Suitability Report, ATR, Costs & Charges, and the product illustration."

**4. Escalation**

> Overall verdict: ESCALATE.
> Agent: [shows full report in chat] + [posts to `#compliance-supervisors`] "Escalated pack: Mrs K. Chen — Pension Transfer — Adviser: J. Smith — Verdict: ESCALATE (4 red verdicts on Consumer Duty criteria) — Dataverse record: [link]"
