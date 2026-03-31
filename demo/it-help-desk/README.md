# IT Help Desk Demo — CPSAgentKit Walkthrough

A self-contained demo that takes a set of requirement documents through the full CPSAgentKit pipeline with minimal manual intervention. The only manual steps are creating agents in the Copilot Studio portal and adding tools/connectors — everything else runs autonomously through the extension commands and Copilot Chat.

## What This Demo Builds

A **multi-agent IT Help Desk** for Contoso Ltd:

| Agent                         | Type   | Owns                                                       |
| ----------------------------- | ------ | ---------------------------------------------------------- |
| **IT Help Desk Orchestrator** | Parent | Dataverse MCP Server (tickets), Office 365 Users connector |
| **Knowledge Specialist**      | Child  | SharePoint IT knowledge base                               |
| **Notification Specialist**   | Child  | Microsoft Teams connector, Office 365 Outlook connector    |

**Key patterns exercised:**

- Dataverse MCP Server as the only Dataverse path (no standard connector)
- MCP tool on the parent (child MCP doesn't work through orchestration)
- SharePoint knowledge on a child agent (dedicated domain)
- Teams + Outlook notification connectors on a child agent
- Entra ID auth, Teams-only channel, no general knowledge

## Prerequisites

- VS Code with the CPSAgentKit extension installed (build from source or install VSIX)
- GitHub Copilot Chat enabled
- A Copilot Studio environment with:
  - Managed Dataverse environment with MCP Server enabled
  - Access to create agents
  - Microsoft Teams, Outlook, Office 365 Users connectors available

## Walkthrough

### Step 1: Set Up the Workspace

Create a fresh folder and open it in VS Code:

```bash
mkdir contoso-it-helpdesk && cd contoso-it-helpdesk && code .
```

### Step 2: Copy Demo Files

Copy the requirement docs and sample data into your workspace:

```bash
mkdir -p Requirements/docs
cp <path-to-CPSAgentKit>/demo/it-help-desk/Requirements/docs/*.md Requirements/docs/
cp -r <path-to-CPSAgentKit>/demo/it-help-desk/sample-data sample-data
```

Your workspace should look like:

```
Requirements/
  docs/
    business-requirements.md
    it-systems-context.md
    sample-interactions.md
sample-data/
  dataverse-seed-data.md
  knowledge-articles/
    approved-devices.md
    mfa-setup.md
    password-reset.md
    printer-setup.md
    software-installation.md
    vpn-setup.md
    wifi-setup.md
```

### Step 3: Initialise the Project

1. Open Command Palette → **CPSAgentKit: Initialise CPS Project**
2. Wait for knowledge sync to complete

This creates `.cpsagentkit/`, `.github/copilot-instructions.md`, and template files.

### Step 4: Generate Spec + Architecture (Autonomous)

1. Open Command Palette → **CPSAgentKit: Create Specification**
2. Select **"Generate from requirements docs"**
3. Copilot Chat opens with a pre-filled runner instruction
4. **Press Enter** — Copilot reads all three requirement docs and generates both `Requirements/spec.md` and `Requirements/architecture.md` in one pass

**What happens autonomously:** The extension reads `Requirements/docs/`, builds the CPS guidance pack from synced knowledge, composes a prompt that includes the spec template, architecture template, and all platform constraints, and sends it to Copilot Chat. Copilot produces both files grounded in CPS best practices.

**Review (optional):** Open the generated files and check they reflect the multi-agent design with Dataverse MCP on the parent, Knowledge Specialist child, and Notification Specialist child.

### Step 5: Run Pre-Build Validation

1. Open Command Palette → **CPSAgentKit: Run Pre-Build**
2. Select the output format (checklist or gap report)
3. Review the generated pre-build checklist in `Requirements/`

This flags what's ready, what needs portal work, and which CPS constraints apply.

### Step 6: Manual Portal Steps (Required)

These steps cannot be automated — the CPS extension requires agents to be created in the portal first:

1. **Create the parent agent** (IT Help Desk Orchestrator) in Copilot Studio
   - Add the Dataverse MCP Server tool
   - Add the Office 365 Users connector — use the **"Get my profile (V2)"** action (not "Get user profile" which requires a UPN input)
   - Set auth to "Authenticate with Microsoft"
   - Set the model to **GPT-5** (Settings → Generative AI)
   - Enable Teams channel

2. **Create child agent: Knowledge Specialist**
   - Add knowledge source: upload the 7 markdown files from `sample-data/knowledge-articles/` as file-based knowledge (or connect a SharePoint site if you have one)
   - No tools needed

3. **Create child agent: Notification Specialist**
   - Add Microsoft Teams connector (Post message in channel)
   - Add Office 365 Outlook connector (Send email)

4. **Sync to local** — Use `Copilot Studio: Get Changes` to pull the agent YAML into the workspace

### Step 7: Build Agent (Autonomous)

1. Open Command Palette → **CPSAgentKit: Build Agent**
2. Select **"Full build"**
3. Copilot Chat opens with a build prompt that includes the spec, architecture, all knowledge, and detected agent YAML
4. **Press Enter** — Copilot generates instructions, topic descriptions, tool descriptions, and settings validation. If Dataverse MCP is connected, it will also create the `cr85a_it_support_tickets` table and seed it with 5 sample tickets from `sample-data/dataverse-seed-data.md`.
5. Apply the generated changes to the YAML files
6. Use `Copilot Studio: Apply Changes` to push to the portal

### Step 8: Test

1. Open the test pane in Copilot Studio portal
2. Try the sample interactions from `Requirements/docs/sample-interactions.md`:
   - "How do I connect to VPN?" → should route to Knowledge Specialist, answer from knowledge articles
   - "My screen is flickering" → should create a ticket via MCP, notify via Teams/Outlook
   - "What's the status of INC-00001?" → should query Dataverse MCP and return the seeded printer ticket
   - "What's the status of my ticket?" → should look up tickets for the authenticated user
   - "Update my [ticket name]" → should find the ticket by name + user email, allow field updates
   - "Delete my [ticket name]" → should find the ticket, show details, require confirmation before deleting
3. If anything misroutes, paste the test output back into **CPSAgentKit: Build Agent** → "Rebuild from test feedback"

## Included Sample Data

### Knowledge Articles (7 articles)

Realistic IT wiki content ready to upload as file-based knowledge sources:

| Article                  | Topics Covered                                                         |
| ------------------------ | ---------------------------------------------------------------------- |
| vpn-setup.md             | GlobalProtect connection, troubleshooting, platform support            |
| wifi-setup.md            | Per-office Wi-Fi names, guest passwords, known issues                  |
| mfa-setup.md             | Authenticator setup, new phone migration, lockout recovery             |
| printer-setup.md         | Printer locations, setup steps (Win/Mac), paper jams, toner            |
| software-installation.md | Pre-installed software, Company Portal, approved list, requests        |
| password-reset.md        | Self-service reset, requirements, account lockout, compromised account |
| approved-devices.md      | Standard devices by role, replacement, BYOD policy, Intune enrollment  |

### Dataverse Seed Data (5 tickets)

Pre-built ticket records covering all statuses:

| Ticket    | Employee       | Priority | Status      | Issue                   |
| --------- | -------------- | -------- | ----------- | ----------------------- |
| INC-00001 | Sarah Mitchell | Low      | Open        | Printer blank pages     |
| INC-00002 | James Cooper   | Medium   | In Progress | VS Code install blocked |
| INC-00003 | Alex Rivera    | High     | In Progress | Screen flickering       |
| INC-00004 | Priya Sharma   | Medium   | Resolved    | VPN drops               |
| INC-00005 | Tom Henderson  | Low      | Closed      | New starter access      |

## What's Manual vs Autonomous

| Step                           | Manual | Autonomous           |
| ------------------------------ | ------ | -------------------- |
| Copy docs into workspace       | ✋     |                      |
| Initialise project             |        | ✅ (one command)     |
| Generate spec + architecture   |        | ✅ (one Enter press) |
| Run pre-build                  |        | ✅ (one command)     |
| Create agents in portal        | ✋     |                      |
| Add tools/connectors in portal | ✋     |                      |
| Sync YAML locally              | ✋     |                      |
| Build agent config             |        | ✅ (one Enter press) |
| Apply changes to portal        | ✋     |                      |
| Test and iterate               | ✋     |                      |

**6 autonomous steps, 4 manual portal steps.** The manual steps are CPS platform constraints — agents, tools, and connectors must be created in the portal first. Everything else runs through the extension.
