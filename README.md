# CPSAgentKit

A VS Code extension that turns GitHub Copilot into a Copilot Studio expert.

## What it does

CPSAgentKit scaffolds CPS agent projects, syncs curated platform knowledge and best practices from a central repo, and generates a `.github/copilot-instructions.md` file that gives GitHub Copilot deep awareness of Copilot Studio constraints, multi-agent patterns, and platform behaviour. Developers work with GitHub Copilot as normal — it just happens to know how to build CPS agents properly.

## How to use it

1. Install the extension alongside the Copilot Studio VS Code extension (pre-release).
2. Clone an agent using the CPS extension. Agent components become YAML files in the workspace.
3. Run **Initialise CPS Project** from the sidebar or command palette.
4. The extension scaffolds the folder structure, pulls the latest knowledge, and writes the instructions file.
5. Add your requirements docs to `Requirements/docs/`, then run **Create Plan**.
6. Run **Pre-Build Checklist** and **Build Agent** to generate agent configs.
7. Apply changes via the CPS extension, test in the portal, paste output back into Copilot Chat.
8. Run **Agent Assessment** or **Solution Assessment** to review against best practices.

### Prerequisites

- Copilot Studio VS Code extension (pre-release)
- GitHub Copilot
- A Copilot Studio environment with agents to work on

## Sidebar

The extension adds a **CPSAgentKit** activity bar panel with commands organised into four sections. Commands enable progressively as you complete each stage.

| Section    | Commands                                      |
| ---------- | --------------------------------------------- |
| **Setup**  | Initialise Project, Sync Knowledge            |
| **Plan**   | Add Requirements, Create Plan                 |
| **Build**  | Pre-Build Checklist, Build Agent              |
| **Assess** | Run Agent Assessment, Run Solution Assessment |

## Commands

All commands are also available from the VS Code command palette under the **CPSAgentKit** category.

### Initialise CPS Project

Scaffolds the project folder structure, pulls the latest CPS platform knowledge from the central repo, and generates `.github/copilot-instructions.md`. If a CPS agent already exists in the workspace, it initialises around it non-destructively.

### Sync Knowledge

Pulls the latest knowledge, templates, and best practices from the central repo. Overwrites the local knowledge folder and regenerates `copilot-instructions.md`. Runs automatically on workspace open if `cpsAgentKit.syncOnOpen` is enabled.

### Create Plan

Offers three modes for creating `Requirements/spec.md` and `Requirements/architecture.md`:

- **Guided wizard** — answer prompts step by step to build both documents interactively.
- **Generate from requirements docs** — reads documents in `Requirements/docs/` and generates both files via Copilot Chat.
- **Generate from existing agent** — reads the cloned CPS agent YAML (settings, topics, actions, knowledge) and reverse-engineers both documents via Copilot Chat. Only appears when a CPS agent is detected in the workspace.

### Pre-Build Checklist

Compares the architecture against the currently cloned CPS YAML, highlights missing build prerequisites, and flags manual portal work such as knowledge sources, MCP setup, and portal-only settings.

### Build Agent

Composes a build prompt from spec + architecture + knowledge and copies it to the clipboard. Paste into Copilot Chat to generate or update agent configurations.

### Run Agent Assessment

Scans all CPS agent folders in the workspace, reads their YAML configuration, and composes a best-practice assessment prompt. Supports four review scopes:

- **Full** — comprehensive review across all dimensions
- **Prompts & Instructions** — focused on instruction quality, structure, and prompt engineering
- **Descriptions & Routing** — focused on routing quality and orchestrator guidance
- **Architecture** — multi-agent decomposition, routing patterns, and output preservation

The assessment prompt includes the full solution snapshot, all knowledge rules, and any requirements documents. Paste it into Copilot Chat to get a prioritised report with findings, remediation actions, and architecture observations.

### Run Solution Assessment

Parses an exported (unmanaged) CPS solution folder — `bot.xml`, `botcomponents/`, and `Workflows/` — and composes a review prompt against best-practice rules. Use this for solutions exported from the portal rather than cloned via the CPS extension.

### Build Demo

Scaffolds one of the included demo projects into your workspace and opens a guided walkthrough prompt in Copilot Chat.

| Demo                   | Description                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **IT Help Desk**       | Interactive multi-agent Teams chatbot — Dataverse MCP, SharePoint knowledge, Teams notifications                    |
| **Application Intake** | Autonomous mailbox-triggered pipeline — 6 agents, email processing, compliance, accessibility, Dataverse connectors |

### Generate Repo Copilot Instructions

Regenerates the repo-maintenance instruction file at `.github/copilot-instructions.md` from the source material in `templates/copilot-instructions-template.md`, `docs/knowledge/`, and `docs/bestpractices/`.

Use this in the CPSAgentKit repo itself after changing knowledge docs, best-practice docs, or the instructions template.

CLI fallback: `npm run generate:repo-instructions`

## Context menus

- **Run Agent Assessment** — right-click any folder in the explorer to assess the CPS agent(s) inside it.
- **Run Solution Assessment** — right-click any `.yaml` or `.yml` file to assess an exported solution.

## Knowledge base

The extension syncs a curated knowledge base covering CPS platform constraints, patterns, and best practices. Key topics:

- Platform constraints and limits
- Multi-agent orchestration patterns
- Prompt engineering for CPS
- Tool and connector descriptions
- Knowledge source configuration
- YAML syntax reference
- Anti-patterns and troubleshooting
- Declarative agents and Direct Line API
- Dataverse MCP setup

Best-practice guides cover platform fundamentals, ALM/governance/security, agent design, tools and multi-agent patterns, and known gotchas.

## Settings

| Setting                           | Default                                        | Description                                           |
| --------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `cpsAgentKit.knowledgeRepoUrl`    | `https://github.com/nlloydjenkins/CPSAgentKit` | GitHub repo URL for the CPS knowledge base            |
| `cpsAgentKit.knowledgeRepoBranch` | `main`                                         | Branch to pull knowledge from                         |
| `cpsAgentKit.syncOnOpen`          | `true`                                         | Sync knowledge automatically when the workspace opens |

## License

MIT
