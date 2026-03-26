# CPK vs CPSAgentKit - Comparison

## Summary

CPK (Copilot Studio Kit) and CPSAgentKit (Copilot Studio Agent Kit) serve the same platform - Microsoft Copilot Studio - but operate at fundamentally different stages of the agent lifecycle with almost no functional overlap.

**CPK** is a Power Platform model-driven app built by Microsoft's Power CAT team. It focuses on post-build activities: batch testing deployed agents, governance at scale, compliance enforcement, conversation analytics, and runtime performance tracking. It lives in Dataverse and requires Power Platform licensing, AI Builder credits, and admin-level access.

**CPSAgentKit** is a VS Code extension that focuses on pre-build and during-build activities: turning GitHub Copilot into a CPS expert, scaffolding agent projects, injecting curated platform knowledge, guiding architecture decisions, generating prompts and configs, and reviewing agent YAML against best practices before deployment.

The two tools are complementary, not competing. CPSAgentKit gets you from idea to well-architected agent. CPK validates and monitors that agent once it is deployed. There is a narrow overlap in agent review/assessment, but even there the approach differs - CPSAgentKit reviews YAML source files at design time via GitHub Copilot, while CPK reviews exported solution packages at runtime via Dataverse.

**Does CPSAgentKit need to exist?** Yes. CPK does not address the design-time developer experience at all. It has no scaffolding, no knowledge injection, no architecture guidance, no spec-driven workflow, and no integration with GitHub Copilot or the VS Code authoring experience. CPSAgentKit fills a gap that CPK was never designed to cover.

---

## At a Glance

| Dimension | CPK (Copilot Studio Kit) | CPSAgentKit (Copilot Studio Agent Kit) |
|---|---|---|
| Built by | Microsoft Power CAT | Community / independent |
| Type | Power Platform model-driven app | VS Code extension |
| Platform | Dataverse / Power Apps / Power Automate | VS Code + GitHub Copilot |
| Licensing | Power Apps, Power Automate Premium, AI Builder credits | Free / MIT |
| Target user | Admins, makers, testers | Developers, power users in VS Code |
| Lifecycle stage | Post-build: test, govern, monitor, analyse | Pre-build and during-build: design, scaffold, build, review |
| Requires CPS environment | Yes (deployed agents) | No (works with local YAML files) |
| Requires Dataverse | Yes | No |

---

## Capability Comparison

### What CPK Does That CPSAgentKit Does Not

| CPK Capability | What It Does | CPSAgentKit Equivalent |
|---|---|---|
| Test Automation | Batch test agents via Direct Line API with response match, topic match, attachment match, generative answer grading, multi-turn scenarios, and plan validation | None. CPSAgentKit has no automated testing. Manual test-and-paste workflow only. |
| Rubrics Refinement | Create, test, and iteratively improve reusable evaluation rubrics for AI-generated responses with human alignment scoring | None |
| Compliance Hub | Define governance policies, enforce risk thresholds, auto-create compliance cases, SLA-driven review lifecycle, quarantine/delete enforcement | None. CPSAgentKit has no governance or compliance features. |
| Agent Inventory | Tenant-wide dashboard of all agents across environments - features used, auth mode, knowledge sources, orchestration type, usage metrics | None |
| Conversation KPIs | Aggregated performance data - sessions, turns, outcomes (resolved/escalated/abandoned), tracked variables, Power BI reports, long-term trending | None |
| Conversation Analyser | Analyse conversation transcripts with custom prompts for actionable insights | None |
| Agent Value Dashboard | Classify agents by type, behaviour, and business value. Visual dashboard aligned to strategic goals. | None |
| Webchat Playground | Customise Web Chat appearance - colours, fonts, thumbnails, behaviour | None |
| Adaptive Cards Gallery | Template library with agent-side implementation examples and dynamic data binding | None |
| SharePoint Sync | Periodically sync SharePoint content to agent knowledge bases as files | None |
| Pipeline-based Automated Deployment | Quality gates via Power Platform Pipelines - automated test then deploy to production | None in v1 (programmatic deploy planned for v2) |

### What CPSAgentKit Does That CPK Does Not

| CPSAgentKit Capability | What It Does | CPK Equivalent |
|---|---|---|
| Project Scaffolding | Creates folder structure, spec template, architecture template, knowledge folder, copilot-instructions.md | None. CPK assumes agents already exist. |
| Knowledge Sync | Pulls curated CPS platform knowledge (constraints, anti-patterns, prompt engineering, multi-agent patterns, troubleshooting) from a central repo | None |
| Copilot Instructions Generation | Generates .github/copilot-instructions.md that makes GitHub Copilot deeply aware of CPS platform constraints and best practices | None. CPK does not integrate with GitHub Copilot or any AI coding assistant. |
| Spec-Driven Workflow | Guided wizard to define purpose, capabilities, success criteria. Copilot then uses this to drive architecture and build decisions. | None |
| Architecture Generation | Guided wizard to define agents, tools, routing logic, manual portal steps. Produces architecture.md that Copilot follows during build. | None |
| Build Checklist | Interactive checklist driven by architecture.md build state - tracks what has been built, what remains | None |
| Build Agent Prompt Composer | Composes a build prompt from spec + architecture + knowledge, ready for Copilot Chat | None |
| CPS VS Code Extension Integration | Works alongside the official CPS VS Code extension - Copilot sees both agent YAML files and platform knowledge simultaneously | None. CPK operates in the Power Apps browser interface. |
| Platform Knowledge Base | Curated, synced library covering constraints, anti-patterns, multi-agent patterns, prompt engineering, tool descriptions, knowledge sources, troubleshooting, declarative agents, Direct Line API | None. CPK does not package or distribute platform knowledge. |
| Best Practices Library | Five-part best practice guide covering platform, ALM/governance, agent design, tools/multi-agent, gotchas and bugs | None |
| Solution Templates | Multi-agent solution templates (e.g. content review with orchestrator and specialist agents, prompt templates, tool definitions, topic structures) | None |

### Where They Overlap

| Area | CPK Approach | CPSAgentKit Approach | Complementary? |
|---|---|---|---|
| Agent Review / Assessment | Agent Review Tool: upload a solution package to Dataverse, automated analysis for anti-patterns, scored results per component, severity ratings, remediation guidance | Run Agent Assessment: scans local YAML files, composes a review prompt with full knowledge rules, pastes into Copilot Chat for a prioritised assessment report | Yes. CPSAgentKit reviews at design time before deployment. CPK reviews deployed solutions. Use CPSAgentKit first to catch issues early, then CPK for ongoing runtime audits. |
| Prompt Guidance | Prompt Advisor: enter a prompt, get a confidence score (0-100), analysis, and optimised alternatives. Requires AI Builder credits. | Curated prompt engineering knowledge: rules for instruction writing, the T-C-R framework, negative constraint handling, knowledge usage patterns. Applied by GitHub Copilot during authoring. | Yes. CPSAgentKit provides guidance while writing prompts. CPK's Prompt Advisor evaluates finished prompts. Different stages of the same activity. |

---

## How They Work Together

The two tools form a natural pipeline across the agent lifecycle:

| Phase | Tool | Activity |
|---|---|---|
| 1. Define | CPSAgentKit | Create spec - purpose, what it does, what it does not, success criteria |
| 2. Architect | CPSAgentKit | Generate architecture - how many agents, what each does, tools, routing, knowledge plan |
| 3. Build | CPSAgentKit | Generate prompts, topic structures, knowledge configs with full platform awareness via Copilot |
| 4. Review (design-time) | CPSAgentKit | Run Agent Assessment on local YAML before deploying |
| 5. Deploy | CPS VS Code Extension | Apply changes to CPS environment |
| 6. Test | CPK | Batch test via Direct Line API - response match, topic match, generative answers |
| 7. Review (runtime) | CPK | Agent Review Tool on deployed solution package |
| 8. Iterate | CPSAgentKit | Paste test output into Copilot Chat, diagnose against spec, fix, redeploy |
| 9. Monitor | CPK | Conversation KPIs, Conversation Analyser, Agent Value dashboard |
| 10. Govern | CPK | Compliance Hub, Agent Inventory across tenant |

---

## Environment and Prerequisites

| Requirement | CPK | CPSAgentKit |
|---|---|---|
| VS Code | Not required | Required |
| GitHub Copilot | Not required | Required |
| Power Platform environment | Required | Not required |
| Dataverse | Required | Not required |
| Power Apps license | Required | Not required |
| Power Automate Premium | Required | Not required |
| AI Builder credits | Required for test automation, Prompt Advisor, rubrics | Not required |
| System Administrator role | Required for install | Not required |
| Power Platform Creator Kit | Required dependency | Not required |
| Azure Application Insights | Optional (enriched test data) | Not required |
| CPS VS Code Extension | Not required | Recommended (for full workflow) |
| Internet access | Required (Dataverse, Direct Line API) | Required (knowledge sync from GitHub) |

---

## Audience Comparison

| Persona | CPK | CPSAgentKit |
|---|---|---|
| CPS Admin / CoE lead | Primary. Inventory, compliance, governance dashboards. | Not the target. |
| Maker (Power Apps / portal) | Primary. Testing, KPIs, Prompt Advisor, Webchat Playground. | Not the target. Portal-first makers would not typically use VS Code. |
| Developer (VS Code) | Secondary. Could use test automation via API, but the UI is Power Apps. | Primary. Built for the VS Code + Copilot workflow. |
| Architect / tech lead | Secondary. Review Tool and compliance are useful. | Primary. Spec-driven architecture, knowledge-driven design decisions. |

---

## Does CPSAgentKit Need to Exist?

**Yes, for three reasons:**

1. **CPK does not cover the design phase.** There is no tool in the CPK that helps a developer go from a business requirement to a well-architected multi-agent solution. CPK assumes agents are already built. CPSAgentKit fills the entire pre-deployment gap - from spec through architecture through knowledge-aware build.

2. **CPK does not integrate with the developer toolchain.** CPK lives entirely in the Power Platform browser experience. It has no VS Code integration, no GitHub Copilot awareness, and no way to inject platform knowledge into an AI coding assistant. For developers who build in VS Code using the CPS extension, CPSAgentKit is the only tool that augments their workflow.

3. **The overlap is minimal and complementary.** The only functional overlap is agent review (different approaches for different stages) and prompt guidance (design-time knowledge vs runtime scoring). In both cases, using both tools provides better coverage than either alone.

**The risk is not redundancy - it is the gap between them.** Without CPSAgentKit, a developer must either know the platform deeply already or build agents without the architectural guidance that prevents common failures. CPK will catch some of those failures after deployment, but by then the cost of remediation is higher.
