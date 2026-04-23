# CPSAgentKit

Turn any MCP-aware LLM into a Copilot Studio expert.

CPSAgentKit provides curated CPS platform knowledge, agent parsing, and best-practice assessment. It ships as two packages — a **VS Code extension** for GitHub Copilot users and a standalone **MCP server** for Claude Desktop, Cursor, or any other MCP client.

Both packages share the same core library and knowledge base.

---

## VS Code Extension

### Prerequisites

- [Copilot Studio VS Code extension](https://marketplace.visualstudio.com/items?itemName=microsoft-IsvExpTools.powerplatform-vscode) (pre-release)
- GitHub Copilot
- A Copilot Studio environment with agents to work on

### Install

Download the latest `.vsix` from [Releases](https://github.com/nlloydjenkins/CPSAgentKit/releases), then:

```bash
code --install-extension cpsagentkit-*.vsix
```

Or build from source:

```bash
git clone https://github.com/nlloydjenkins/CPSAgentKit.git
cd CPSAgentKit
npm install
npm run compile
npm run package:extension
npm run install:vsix
```

### Usage

1. Clone an agent using the CPS extension. Agent components become YAML files in the workspace.
2. Run **Initialise CPS Project** from the sidebar or command palette.
3. The extension scaffolds the folder structure, pulls the latest knowledge, and writes `.github/copilot-instructions.md`.
4. Add your requirements docs to `Requirements/docs/`, then run **Create Plan**.
5. Run **Build Agent** to generate agent configs.
6. Apply changes via the CPS extension, test in the portal, paste output back into Copilot Chat.
7. Run **Agent Assessment** or **Solution Assessment** to review against best practices.

---

## MCP Server

Use CPSAgentKit with Claude Desktop, Cursor, VS Code MCP, or any MCP-aware client — no extension install needed.

### Quick start (no install)

```bash
npx @cpsagentkit/mcp-server --transport=stdio
```

### Global install

```bash
npm install -g @cpsagentkit/mcp-server
cpsagentkit-mcp --transport=stdio
```

### Claude Desktop

Add to your `claude_desktop_config.json` (typically `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "cpsagentkit": {
      "command": "npx",
      "args": ["-y", "@cpsagentkit/mcp-server", "--transport=stdio"]
    }
  }
}
```

Restart Claude Desktop. The CPS tools will appear in the tool list.

### Claude Code

```bash
claude mcp add cpsagentkit -- npx -y @cpsagentkit/mcp-server --transport=stdio
```

This registers the server for the current project. Use `--scope user` to make it available globally:

```bash
claude mcp add --scope user cpsagentkit -- npx -y @cpsagentkit/mcp-server --transport=stdio
```

### VS Code (MCP config)

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "cpsagentkit": {
      "command": "npx",
      "args": ["-y", "@cpsagentkit/mcp-server", "--transport=stdio"]
    }
  }
}
```

### HTTP transport

For clients that connect to a long-running server:

```bash
cpsagentkit-mcp --transport=http --host=127.0.0.1 --port=3333
```

The endpoint is `POST /mcp` (MCP Streamable HTTP spec).

### Available tools

| Category       | Tools                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Knowledge**  | `cps_list_knowledge_topics`, `cps_get_knowledge`, `cps_get_best_practice`                                           |
| **Parsing**    | `cps_detect_project_state`, `cps_list_agents`, `cps_parse_agent`, `cps_parse_solution`, `cps_find_solution_folders` |
| **Assessment** | `cps_validate_tool_description`, `cps_compose_review_prompt`                                                        |
| **Build**      | `cps_generate_topic_scaffolds`, `cps_detect_dataverse_mcp`                                                          |

All bundled knowledge and best-practice documents are also exposed as MCP resources (`cpsagentkit://<category>/<slug>`).

### Deploy to Azure

You can host the MCP server on Azure App Service so remote MCP clients can connect over HTTPS. Infrastructure files are included in `packages/mcp-server/`.

**Prerequisites:** [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) and [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd).

```bash
cd packages/mcp-server
azd auth login
azd init
azd up
```

This provisions a Linux App Service plan and deploys the MCP server. The output includes the endpoint URL:

```
mcpEndpoint = https://<app-name>.azurewebsites.net/mcp
```

Point any MCP client at that URL using the Streamable HTTP transport. For example, in Claude Desktop:

```json
{
  "mcpServers": {
    "cpsagentkit": {
      "url": "https://<app-name>.azurewebsites.net/mcp"
    }
  }
}
```

---

## Sidebar

The extension adds a **CPSAgentKit** activity bar panel with commands organised into four sections. Commands enable progressively as you complete each stage.

| Section    | Commands                                      |
| ---------- | --------------------------------------------- |
| **Setup**  | Initialise Project, Sync Knowledge            |
| **Plan**   | Add Requirements, Create Plan                 |
| **Build**  | Build Agent                                   |
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
