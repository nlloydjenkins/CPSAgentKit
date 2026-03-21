# CPSAgentKit

A VS Code extension that turns GitHub Copilot into a Copilot Studio expert.

## What it does

Scaffolds CPS agent projects, syncs curated platform knowledge, and writes a `.github/copilot-instructions.md` that makes GitHub Copilot deeply aware of Copilot Studio constraints, multi-agent patterns, and best practices. Developers work with GHCP normally — it just happens to know everything about building CPS agents properly.

## How it works

1. Developer installs the extension alongside the **Copilot Studio VS Code extension** (pre-release)
2. Clones an agent using the CPS extension (agent components become YAML files in the workspace)
3. Runs **Initialise CPS Project** from the command palette
4. Extension scaffolds the folder structure, pulls latest knowledge from the central repo, writes the instructions file
5. Developer tells GHCP what they need — GHCP creates a spec, proposes an architecture, generates agent configs
6. GHCP can see both the CPS agent YAML files AND the platform knowledge — it edits the actual agent with deep platform awareness
7. Developer applies changes via `Copilot Studio: Apply changes`, tests in the portal, pastes output back into GHCP
8. GHCP evaluates against the spec and iterates

## Prerequisites

- **Copilot Studio VS Code extension** (pre-release) — handles agent cloning, editing, and sync
- **GitHub Copilot** — the AI that does the thinking, powered by our knowledge base
- A Copilot Studio environment with agents to work on

## Repo structure

```
project-root/
├── .github/
│   └── copilot-instructions.md     ← generated, drives GHCP behaviour
├── .cpsagentkit/
│   ├── knowledge/                  ← CPS platform knowledge (synced)
│   │   ├── constraints.md
│   │   ├── prompt-engineering.md
│   │   ├── multi-agent-patterns.md
│   │   ├── tool-descriptions.md
│   │   ├── knowledge-sources.md
│   │   ├── anti-patterns.md
│   │   ├── cheat-sheet.md
│   │   └── troubleshooting.md
│   └── config.json
├── spec.md                         ← the business intent (developer + GHCP)
├── architecture.md                 ← the solution design (GHCP generated)
├── [agent-name]/                   ← CPS Extension (cloned agent YAML)
│   ├── topics/
│   ├── actions/
│   ├── triggers/
│   ├── knowledge/
│   └── settings.yaml
├── templates/                      ← bundled with extension
└── src/                            ← VS Code extension source
```

## Development

See [docs/SPEC.md](docs/SPEC.md) for the full extension specification and architecture.

The `docs/knowledge/` folder contains the CPS platform knowledge that powers the extension. These files are the product — they encode real-world deployment experience that doesn't exist in Microsoft's documentation.
