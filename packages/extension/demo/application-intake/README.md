# Application Intake Agent Demo — CPSAgentKit Walkthrough

A self-contained demo that takes a set of requirement documents through the full CPSAgentKit pipeline with minimal manual intervention. The manual steps are creating agent shells and connections in the Copilot Studio portal — the extension generates all instructions, descriptions, tool configurations, and settings. This demo builds an **autonomous, trigger-driven multi-agent system** — unlike the IT Help Desk demo (interactive Teams chat), this agent runs without user interaction, processing inbound emails from a shared mailbox.

## What This Demo Builds

A **6-agent autonomous pipeline** for application intake at a fictional organisation:

| Agent                               | Type   | Owns                                                                                           |
| ----------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| **Application Intake Orchestrator** | Parent | Dataverse connectors, Outlook email, Teams adaptive cards, Attachment Preprocessor prompt tool |
| **Email Interpreter**               | Child  | Application Type Definitions knowledge source                                                  |
| **Completeness Assessor**           | Child  | Application Type Definitions knowledge source                                                  |
| **Correspondence Drafter**          | Child  | Application Type Definitions knowledge source                                                  |
| **Compliance Evaluator**            | Child  | Compliance Rules knowledge source                                                              |
| **Accessibility Presenter**         | Child  | Accessibility Standards knowledge source                                                       |

**Key patterns exercised:**

- **Autonomous / trigger-driven agent** — mailbox event trigger + daily chase schedule, no user chat
- **Multi-agent pipeline with stage-by-stage control** — 11 numbered stages with anti-termination instructions
- **Evaluate–revise–present loop** — Compliance Evaluator can reject drafts, loop back to Drafter (max 2 cycles)
- **Pre-bound Dataverse connector actions** — separate actions per table to avoid `UnresolvedDynamicType`
- **Prompt tool with code interpreter** — attachment preprocessing
- **Knowledge sources split by domain** — compliance, accessibility, application types
- **N/A sentinel pattern** — for optional fields in autonomous pipelines
- **Contradiction detection and escalation** — Teams adaptive cards for human-in-the-loop
- **All tools on parent** — child agents are instruction-specialised only (no tools)
- **General knowledge disabled** — compliance-sensitive domain

## Prerequisites

- VS Code with the CPSAgentKit extension installed (build from source or install VSIX)
- GitHub Copilot Chat enabled
- A Copilot Studio environment with:
  - Managed Dataverse environment
  - Access to create agents
  - Microsoft Teams, Outlook connectors available
  - A shared mailbox with Send As permission for the maker account

## Walkthrough

### Step 1: Set Up the Workspace

Create a fresh folder and open it in VS Code:

```bash
mkdir contoso-application-intake && cd contoso-application-intake && code .
```

### Step 2: Copy Demo Files

Copy the requirement docs and sample data into your workspace:

```bash
mkdir -p Requirements/docs
cp <path-to-CPSAgentKit>/demo/application-intake/Requirements/docs/*.md Requirements/docs/
cp -r <path-to-CPSAgentKit>/demo/application-intake/sample-data sample-data
```

Your workspace should look like:

```
Requirements/
  docs/
    business-requirements.md
    systems-context.md
    sample-interactions.md
sample-data/
  dataverse-seed-data.md
  knowledge-sources/
    compliance-rules.md
    accessibility-standards.md
    application-type-definitions.md
```

### Step 3: Create the Teams Escalation Channel

Before building the agent, create the Team and channel for human-in-the-loop escalation:

1. Open **Microsoft Teams**
2. Create a new team called **Applications Team** (or use an existing one)
3. Add a channel called **Escalations**

The orchestrator agent will post adaptive cards to this channel when cases need human review.

### Step 4: Set Up the Shared Mailbox

1. Ensure the shared mailbox (e.g. `applications@contoso.com`) exists in your M365 tenant
2. Grant the maker account **Send As** permission on the shared mailbox
3. Note the mailbox address — you'll need it when configuring the Outlook connector

### Step 5: Initialise the Project

1. Open Command Palette → **CPSAgentKit: Initialise CPS Project**
2. Wait for knowledge sync to complete

This creates `.cpsagentkit/`, `.github/copilot-instructions.md`, and template files.

### Step 6: Generate Spec + Architecture (Autonomous)

1. Open Command Palette → **CPSAgentKit: Create Specification**
2. Select **"Generate from requirements docs"**
3. Copilot Chat opens with a pre-filled runner instruction
4. **Press Enter** — Copilot reads all three requirement docs and generates both `Requirements/spec.md` and `Requirements/architecture.md` in one pass

**What happens autonomously:** The extension reads `Requirements/docs/`, builds the CPS guidance pack from synced knowledge, composes a prompt that includes the spec template, architecture template, and all platform constraints, and sends it to Copilot Chat. Copilot produces both files grounded in CPS best practices.

**Review:** Open the generated files and check for:

- Hub-and-spoke architecture with 5 child agents
- All tools on the parent agent (child agents are tool-less)
- Autonomous triggers (mailbox + chase scan) owned by the parent
- Pre-bound Dataverse connector actions (one per table)
- Evaluate–revise–present loop documented in routing logic
- Knowledge sources split: compliance, accessibility, application types
- General knowledge disabled
- Content moderation flagged as a manual portal step

### Step 7: Run Pre-Build Validation

1. Open Command Palette → **CPSAgentKit: Run Pre-Build**
2. Review the generated pre-build checklist

This flags what's ready, what needs portal work, and which CPS constraints apply. For this demo, expect flags for:

- Shared mailbox trigger configuration (portal)
- Pre-bound Dataverse actions per table (portal)
- Prompt tool creation (portal)
- Content moderation setting (portal)
- Knowledge source upload (portal)

### Step 8: Manual Portal Steps (Required)

These steps cannot be automated — the CPS extension requires agents to be created in the portal first. You only need to create the shells and connections here — the **Build Agent** command (Step 9) generates all instructions, descriptions, and tool configurations.

1. **Create the parent agent** (Application Intake Orchestrator) in Copilot Studio
   - Set auth to "Authenticate with Microsoft"
   - Enable generative orchestration
   - Set the model to **GPT-5** (Settings → Generative AI)
   - Set content moderation to **Low** (Settings → Generative AI)

2. **Add tools to the parent** (connections only — descriptions come from the build step):
   - **Microsoft Dataverse — List rows from selected environment**
   - **Microsoft Dataverse — Add a new row to selected environment** — create **3 separate pre-bound actions**, one per target table:
     - "Create application record" → entity = `cr85a_applications`
     - "Log correspondence" → entity = `cr85a_correspondences`
     - "Log compliance check" → entity = `cr85a_compliancechecks`
   - **Microsoft Dataverse — Update a row in selected environment**
   - **Office 365 Outlook — Get email (V3)**
   - **Office 365 Outlook — Send an email from a shared mailbox (V2)**
   - **Microsoft Teams — Post adaptive card and wait for a response**
   - Disable the generic "Add a new row" tool after creating the pre-bound versions

3. **Create the Attachment Preprocessor prompt tool** in Copilot Studio or AI Hub
   - Enable code interpreter
   - Input: attachment content + case context
   - Output: normalised text/Markdown

4. **Create 5 child agents** (just names + knowledge — instructions and descriptions come from the build step):
   - **Email Interpreter** — upload `application-type-definitions.md` as knowledge
   - **Completeness Assessor** — upload `application-type-definitions.md` as knowledge
   - **Correspondence Drafter** — upload `application-type-definitions.md` as knowledge
   - **Compliance Evaluator** — upload `compliance-rules.md` as knowledge
   - **Accessibility Presenter** — upload `accessibility-standards.md` as knowledge

5. **Create Dataverse tables** — `cr85a_applications`, `cr85a_correspondences`, and `cr85a_compliancechecks` with the schemas in `Requirements/docs/systems-context.md`

6. **Configure the autonomous trigger** — add a mailbox event trigger on the parent, pointing at the shared mailbox

7. **Sync to local** — `Copilot Studio: Get Changes` to pull the agent YAML into the workspace

### Step 9: Build Agent (Autonomous)

1. Open Command Palette → **CPSAgentKit: Build Agent**
2. Select **"Full build"**
3. Copilot Chat opens with a build prompt that includes the spec, architecture, all knowledge, and detected agent YAML
4. **Press Enter** — Copilot generates:
   - Parent orchestrator instructions with numbered pipeline stages and anti-termination controls
   - Child agent instructions with boundary enforcement (explicit prohibitions)
   - Tool `modelDescription` values for all connector actions (with choice integer mappings)
   - Connector action input descriptions for autonomous execution
   - Topic descriptions
   - Settings coherence validation
5. Apply the generated changes to the YAML files
6. Use `Copilot Studio: Apply Changes` to push to the portal

### Step 10: Seed Dataverse

Load the 5 sample application records from `sample-data/dataverse-seed-data.md` into the `cr85a_applications` table. You can:

- Use the Dataverse MCP tool in GitHub Copilot Agent mode
- Manually create records in the Dataverse table editor
- Use Power Apps model-driven app

### Step 11: Test

Test the pipeline by sending emails to the shared mailbox. Use the scenarios from `Requirements/docs/sample-interactions.md`:

1. **Complete application** — send Sarah Mitchell's email → expect: full pipeline runs, acknowledgement email sent, Dataverse records created
2. **Incomplete application** — send Alex Jones's email → expect: information request email listing missing fields
3. **Reply with missing info** — reply to Alex's thread with the missing fields → expect: thread match, merge, acknowledgement
4. **Contradiction** — reply on Sarah's thread changing account number → expect: Teams adaptive card, no overwrite
5. **Ambiguous intent** — send Jamil Khan's email → expect: Teams escalation
6. **Chase workflow** — ensure Record 2 (seed data) has a past NextChaseDate, trigger the chase scan

**Check in the Activity Map** for each test:

- [ ] Correct child agents invoked in the right order
- [ ] No child agent output displayed directly to user (suppressed by anti-termination instructions)
- [ ] Pipeline completed all stages (didn't stop after first child)
- [ ] Dataverse records created/updated correctly
- [ ] Compliance Evaluator invoked for every outbound email
- [ ] Accessibility Presenter invoked after compliance pass

If anything misroutes or stops early, paste the test output back into **CPSAgentKit: Build Agent** → "Rebuild from test feedback".

## Included Sample Data

### Knowledge Sources (3 documents)

Domain-specific guidance uploaded as file-based knowledge sources to child agents:

| Document                        | Child Agent(s)                                                   | Content                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| compliance-rules.md             | Compliance Evaluator                                             | 8 compliance rules with pass/fail examples and revision instruction templates                             |
| accessibility-standards.md      | Accessibility Presenter                                          | Reading level targets, plain English word list, dyslexia-friendly formatting, worked before/after example |
| application-type-definitions.md | Email Interpreter, Completeness Assessor, Correspondence Drafter | 5 application types with required/optional fields, routing rules, type-specific compliance requirements   |

### Dataverse Seed Data (5 application records)

Pre-built records covering all key statuses:

| Reference     | Applicant      | Type              | Status               | Notes                                 |
| ------------- | -------------- | ----------------- | -------------------- | ------------------------------------- |
| APP-2026-0001 | Sarah Mitchell | Account Amendment | Ready for Processing | Complete application, high confidence |
| APP-2026-0002 | Alex Jones     | Account Amendment | Awaiting Applicant   | Chase due, missing DOB + account      |
| APP-2026-0003 | David Thompson | Cancellation      | Escalated            | Contradiction detected                |
| APP-2026-0004 | Priya Sharma   | New Application   | New                  | Pending interpretation                |
| APP-2026-0005 | Tom Henderson  | Account Amendment | Closed – No Response | Chase limit reached                   |

## What's Manual vs Autonomous

| Step                              | Manual | Autonomous           |
| --------------------------------- | ------ | -------------------- |
| Copy docs into workspace          | ✋     |                      |
| Create Teams channel + mailbox    | ✋     |                      |
| Initialise project                |        | ✅ (one command)     |
| Generate spec + architecture      |        | ✅ (one Enter press) |
| Run pre-build                     |        | ✅ (one command)     |
| Create agent shells in portal     | ✋     |                      |
| Add tools/connectors/knowledge    | ✋     |                      |
| Create Dataverse tables + trigger | ✋     |                      |
| Sync YAML locally                 | ✋     |                      |
| Build agent config                |        | ✅ (one Enter press) |
| Apply changes to portal           | ✋     |                      |
| Seed data + test                  | ✋     |                      |

**4 autonomous steps, 8 manual steps.** The manual steps are CPS platform constraints — agents, tools, connectors, and triggers must be created in the portal first. The build step generates the bulk of the configuration: all agent instructions, descriptions, tool `modelDescription` values, connector input descriptions, and settings validation.

## Comparison with IT Help Desk Demo

| Dimension               | IT Help Desk                         | Application Intake                                                           |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| **Interaction model**   | Interactive Teams chat               | Autonomous mailbox trigger                                                   |
| **Agent count**         | 3 (parent + 2 children)              | 6 (parent + 5 children)                                                      |
| **Pipeline complexity** | Simple routing (knowledge or ticket) | 11-stage pipeline with revision loops                                        |
| **Dataverse access**    | MCP Server                           | Pre-bound connector actions (multi-table writes)                             |
| **Knowledge sources**   | 7 IT articles                        | 3 domain documents (compliance, accessibility, app types)                    |
| **Compliance loop**     | None                                 | Evaluate–revise–present with max 2 cycles                                    |
| **Key CPS patterns**    | MCP on parent, SharePoint knowledge  | Anti-termination, N/A sentinel, boundary enforcement, connector input config |
