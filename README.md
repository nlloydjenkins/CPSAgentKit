# CPSAgentKit

A VS Code extension that turns GitHub Copilot into a Copilot Studio expert.

## What it does

CPSAgentKit scaffolds CPS agent projects, syncs curated platform knowledge and best practices from a central repo, and generates a `.github/copilot-instructions.md` file that gives GitHub Copilot deep awareness of Copilot Studio constraints, multi-agent patterns, and platform behaviour. Developers work with GitHub Copilot as normal — it just happens to know how to build CPS agents properly.

## How to use it

1. Install the extension alongside the Copilot Studio VS Code extension (pre-release).
2. Clone an agent using the CPS extension. Agent components become YAML files in the workspace.
3. Run **CPSAgentKit: Initialise CPS Project** from the command palette.
4. The extension scaffolds the folder structure, pulls the latest knowledge, and writes the instructions file.
5. Tell GitHub Copilot what you need. It creates a spec, proposes an architecture, and generates agent configs.
6. Apply changes via the CPS extension, test in the portal, paste output back into Copilot Chat.
7. Copilot evaluates against the spec and iterates.

### Prerequisites

- Copilot Studio VS Code extension (pre-release)
- GitHub Copilot
- A Copilot Studio environment with agents to work on

## Commands

All commands are available from the VS Code command palette under the **CPSAgentKit** category.

### Initialise CPS Project

Scaffolds the project folder structure, pulls the latest CPS platform knowledge from the central repo, and generates `.github/copilot-instructions.md`. If a CPS agent already exists in the workspace, it initialises around it non-destructively.

### Sync Knowledge

Pulls the latest knowledge, templates, and best practices from the central repo. Overwrites the local knowledge folder and regenerates `copilot-instructions.md`. Runs automatically on workspace open if `cpsAgentKit.syncOnOpen` is enabled.

### Create Spec (Guided)

Step-by-step wizard that walks through defining agent purpose, capabilities, boundaries, and success criteria. Writes the result to `requirements/spec.md`.

### Create Architecture (Guided)

Wizard to define agents, tools, routing logic, and manual portal steps. Writes the result to `requirements/architecture.md`.

### Build Checklist

Interactive checklist driven by the Build State section in `requirements/architecture.md`. Tracks what has been built, what needs manual portal steps, and what remains.

### Build Agent

Composes a build prompt from spec + architecture + knowledge and copies it to the clipboard. Paste into Copilot Chat to generate or update agent configurations.

### Run Agent Assessment

Scans all CPS agent folders in the workspace, reads their YAML configuration, and composes a best-practice assessment prompt. Supports four review scopes:

- **Full** — comprehensive review across all dimensions
- **Prompts & Instructions** — focused on instruction quality, structure, and prompt engineering
- **Descriptions & Routing** — focused on routing quality and orchestrator guidance
- **Architecture** — multi-agent decomposition, routing patterns, and output preservation

The assessment prompt includes the full solution snapshot, all knowledge rules, and any requirements documents. Paste it into Copilot Chat to get a prioritised report with findings, remediation actions, and architecture observations.

## Settings

| Setting                           | Default                                        | Description                                           |
| --------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `cpsAgentKit.knowledgeRepoUrl`    | `https://github.com/nlloydjenkins/CPSAgentKit` | GitHub repo URL for the CPS knowledge base            |
| `cpsAgentKit.knowledgeRepoBranch` | `main`                                         | Branch to pull knowledge from                         |
| `cpsAgentKit.syncOnOpen`          | `true`                                         | Sync knowledge automatically when the workspace opens |

## License

MIT
