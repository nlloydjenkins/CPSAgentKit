# Use Case 6 — Financial Advice Pack Review

This folder contains the use case requirements document plus the five knowledge base documents the agent uses to ground every assessment.

## Files

- [business-requirements.md](business-requirements.md) — the use case requirements (copy of `../06-financial-advice-pack-review.md`)
- **Knowledge base documents** (each scoped to a specific prompt tool in the pipeline):
  - [knowledge/consumer-duty-rules.md](knowledge/consumer-duty-rules.md) — FCA Consumer Duty outcomes and cross-cutting rules → Consumer Duty Evaluator
  - [knowledge/firm-suitability-policy.md](knowledge/firm-suitability-policy.md) — Helios internal suitability policy, 12 criteria → Suitability Policy Evaluator
  - [knowledge/grading-rubric.md](knowledge/grading-rubric.md) — 5-pillar weighted scoring rubric → Grading Rubric
  - [knowledge/required-disclosures.md](knowledge/required-disclosures.md) — prescribed disclosure wording → Disclosure Checker
  - [knowledge/advice-type-taxonomy.md](knowledge/advice-type-taxonomy.md) — advice type definitions → Pack Classifier + Suitability Policy Evaluator
- **Sample advice pack** ([sample-pack/](sample-pack/README.md)) — 5 generated PDFs for a fictional client (Mrs K. Chen pension transfer) you can upload in the test pane or Teams to exercise the agent end-to-end. Includes deliberate flaws (outdated FSCS limit, missing 10-year cost projection) so the agent has realistic issues to flag.

## How to use

1. Copy this entire folder's contents into a fresh workspace's `Requirements/docs/` folder.
2. Upload the five `knowledge/*.md` files to the SharePoint library that will back the agent's knowledge sources.
3. Run **CPSAgentKit: Create Plan** — the knowledge documents will be listed in `spec.md` and `architecture.md` as grounding sources, each scoped to a specific pipeline stage.
4. Run **CPSAgentKit: Build Agent** to generate the pipeline topic, prompt tool configurations, and Dataverse action scaffolding.

## Knowledge document conventions

All five documents follow the same structure so the prompt tools can consume them reliably:

- Short preamble stating scope and intended consumer
- Numbered criteria or rules with unique IDs (e.g. `CD-1.2`, `SP-3`, `DISC-FSCS`) so the Reporter can cite them verbatim
- "What good looks like" examples where ambiguity is common
- "What fails" examples showing common breaches
- Version stamp at the top of every file

The IDs matter: the Reporter cites them in the final report and stores them verbatim in the Dataverse audit record. Changing an ID silently breaks regression tracking.

## Regulatory disclaimer

The content in `knowledge/consumer-duty-rules.md` and `knowledge/required-disclosures.md` is **illustrative** and modelled on the FCA Consumer Duty framework (PRIN 2A) and related handbook rules as a reference pattern. Before deploying, a qualified compliance officer at the firm must review, correct, and approve all regulatory wording. The agent does not replace regulatory judgement — it grounds assessments in whatever wording the firm's compliance team authorises in these files.
