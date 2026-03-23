# CPSAgentKit

A VS Code extension that turns GitHub Copilot into a Copilot Studio expert.

## What it does

CPSAgentKit scaffolds CPS agent projects, syncs curated platform knowledge and best practices from a central repo, and generates a `.github/copilot-instructions.md` file that gives GitHub Copilot deep awareness of Copilot Studio constraints, multi-agent patterns, and platform behaviour. Developers work with GitHub Copilot as normal. It just happens to know how to build CPS agents properly.

## How it works

1. Install the extension alongside the Copilot Studio VS Code extension (pre-release).
2. Clone an agent using the CPS extension. Agent components become YAML files in the workspace.
3. Run **CPSAgentKit: Initialise CPS Project** from the command palette.
4. The extension scaffolds the folder structure, pulls the latest knowledge from the central repo, and writes the instructions file.
5. Tell GitHub Copilot what you need. It creates a spec, proposes an architecture, and generates agent configs.
6. GitHub Copilot can see both the CPS agent YAML files and the platform knowledge. It edits the actual agent with full platform awareness.
7. Apply changes via the CPS extension, test in the portal, paste output back into Copilot Chat.
8. Copilot evaluates against the spec and iterates.

## Commands

All commands are available from the VS Code command palette under the **CPSAgentKit** category.

| Command                      | Description                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Initialise CPS Project       | Scaffolds folders, syncs knowledge, generates copilot-instructions.md                        |
| Sync Knowledge               | Pulls the latest knowledge, templates, and best practices from the central repo              |
| Create Spec (Guided)         | Step-by-step wizard to define agent purpose, capabilities, and success criteria              |
| Create Architecture (Guided) | Wizard to define agents, tools, routing logic, and manual portal steps                       |
| Build Checklist              | Interactive checklist driven by the Build State section in architecture.md                   |
| Build Agent                  | Composes a build prompt from spec + architecture + knowledge, copies to clipboard            |
| Run Agent Assessment         | Reviews agent YAML against the full best practice ruleset, copies review prompt to clipboard |

## Settings

| Setting                           | Default                                        | Description                                           |
| --------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `cpsAgentKit.knowledgeRepoUrl`    | `https://github.com/nlloydjenkins/CPSAgentKit` | GitHub repo URL for the CPS knowledge base            |
| `cpsAgentKit.knowledgeRepoBranch` | `main`                                         | Branch to pull knowledge from                         |
| `cpsAgentKit.syncOnOpen`          | `true`                                         | Sync knowledge automatically when the workspace opens |

## Prerequisites

- Copilot Studio VS Code extension (pre-release), which handles agent cloning, editing, and sync
- GitHub Copilot
- A Copilot Studio environment with agents to work on

## Workspace structure

After initialisation, the workspace looks like this:

```
project-root/
├── .github/
│   └── copilot-instructions.md        # Generated. Drives GitHub Copilot behaviour.
├── .cpsagentkit/
│   ├── config.json                     # Project config (repo URL, sync timestamp, paths)
│   ├── knowledge/                      # CPS platform knowledge (synced from central repo)
│   │   ├── anti-patterns.md
│   │   ├── cheat-sheet.md
│   │   ├── constraints.md
│   │   ├── declarative-agents.md
│   │   ├── direct-line-api.md
│   │   ├── knowledge-sources.md
│   │   ├── multi-agent-patterns.md
│   │   ├── prompt-engineering.md
│   │   ├── tool-descriptions.md
│   │   └── troubleshooting.md
│   ├── bestpractices/                  # Best practice guides (synced from central repo)
│   │   ├── part1-platform.md
│   │   ├── part2-alm-governance-security.md
│   │   ├── part3-agent-design.md
│   │   ├── part4-tools-multiagent.md
│   │   └── part5-gotchas-bugs.md
│   └── templates/                      # Agent solution templates (synced from central repo)
├── requirements/
│   ├── spec.md                         # Business intent (developer + Copilot)
│   ├── architecture.md                 # Solution design (Copilot generated)
│   └── docs/                           # Additional requirement documents
├── docs/
│   └── bestpractices/                  # User-facing best practice documents
└── [agent-name]/                       # CPS agent folder (cloned via CPS extension)
    ├── settings.yaml
    ├── agent.mcs.yml
    ├── connectionreferences.mcs.yml
    ├── topics/
    ├── actions/
    └── knowledge/
```

## Source structure

```
src/
├── extension.ts                        # Extension entry point and activation
├── commands/
│   ├── init.ts                         # Initialise CPS Project
│   ├── syncKnowledge.ts                # Sync Knowledge
│   ├── createSpec.ts                   # Create Spec wizard
│   ├── createArchitecture.ts           # Create Architecture wizard
│   ├── build.ts                        # Build Checklist
│   ├── buildAgent.ts                   # Build Agent prompt composer
│   ├── reviewSolution.ts              # Run Agent Assessment
│   └── openSpec.ts                     # Open spec.md helper
├── services/
│   ├── config.ts                       # Config read/write (.cpsagentkit/config.json)
│   ├── projectState.ts                 # Workspace state detection
│   ├── knowledgeSync.ts                # GitHub API sync (knowledge, templates, best practices)
│   ├── instructionsGenerator.ts        # copilot-instructions.md assembly
│   ├── solutionReviewer.ts             # Agent assessment snapshot and prompt composition
│   └── fileUtils.ts                    # Shared filesystem utilities
└── ui/
    ├── statusBar.ts                    # Status bar item
    └── uiUtils.ts                      # Shared UI helpers (workspace guard, collectList, clipboard)
```

## Development

```
npm install
npm run compile
```

To test in VS Code, press F5 to launch the Extension Development Host.

To package for distribution:

```
npm run package
```

See [docs/SPEC.md](docs/SPEC.md) for the full extension specification and architecture.

The `docs/knowledge/` folder contains the CPS platform knowledge that powers the extension. These files encode real-world deployment experience that is not covered in Microsoft's documentation.

## License

MIT
