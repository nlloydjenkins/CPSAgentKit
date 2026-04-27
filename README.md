# CPSAgentKit

Turn any LLM into a Copilot Studio expert.

CPSAgentKit ships as three packages sharing a common core:

| Package | Surface | Install |
|---------|---------|---------|
| `@cpsagentkit/core` | Shared library | Internal dependency |
| `cpsagentkit` | VS Code extension | [VSIX from Releases](https://github.com/nlloydjenkins/CPSAgentKit/releases) |
| `@cpsagentkit/mcp-server` | MCP server | `npx @cpsagentkit/mcp-server` |

```
┌──────────────────────────────────────────────┐
│              @cpsagentkit/core               │
│  knowledge · parsing · assessment · build    │
├──────────────┬───────────────────────────────┤
│  VS Code     │  MCP Server                   │
│  Extension   │  (stdio / http)               │
│              │                               │
│  Sidebar +   │  Claude Desktop, Cursor,      │
│  Copilot     │  VS Code MCP, Claude Code,    │
│  Chat        │  any MCP client               │
└──────────────┴───────────────────────────────┘
```

---

## MCP Server

Works with Claude Desktop, Cursor, Claude Code, VS Code, or any MCP-aware client.

### Setup

**npx (no install):**

```bash
npx @cpsagentkit/mcp-server --transport=stdio
```

**Claude Desktop** — add to `claude_desktop_config.json`:

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

**Claude Code:**

```bash
claude mcp add cpsagentkit -- npx -y @cpsagentkit/mcp-server --transport=stdio
```

**VS Code** — add to `.vscode/mcp.json`:

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

**HTTP transport** (for remote clients):

```bash
npx @cpsagentkit/mcp-server --transport=http --port=3333
```

Endpoint: `POST http://127.0.0.1:3333/mcp`

### Tools

| Category | Tools |
|----------|-------|
| **Knowledge** | `cps_list_knowledge_topics`, `cps_get_knowledge`, `cps_get_best_practice` |
| **Parsing** | `cps_detect_project_state`, `cps_list_agents`, `cps_parse_agent`, `cps_parse_solution`, `cps_find_solution_folders` |
| **Assessment** | `cps_validate_tool_description`, `cps_compose_review_prompt` |
| **Build** | `cps_generate_topic_scaffolds`, `cps_detect_dataverse_mcp` |

All knowledge and best-practice documents are also exposed as MCP resources (`cpsagentkit://<category>/<slug>`).

### Deploy to Azure

```bash
cd packages/mcp-server
azd auth login && azd init && azd up
```

Provisions an App Service and outputs the endpoint URL. Point any MCP client at `https://<app-name>.azurewebsites.net/mcp`.

---

## VS Code Extension

### Setup

**Prerequisites:** [Copilot Studio VS Code extension](https://marketplace.visualstudio.com/items?itemName=microsoft-IsvExpTools.powerplatform-vscode) (pre-release) and GitHub Copilot.

**Install from release:**

```bash
code --install-extension cpsagentkit-*.vsix
```

**Build from source:**

```bash
git clone https://github.com/nlloydjenkins/CPSAgentKit.git
cd CPSAgentKit && npm install && npm run compile
npm run package:extension && npm run install:vsix
```

### Usage

1. Clone an agent using the CPS extension (agent YAML appears in the workspace).
2. Run **Initialise CPS Project** — scaffolds folders, syncs knowledge, writes `copilot-instructions.md`.
3. Add requirements to `Requirements/docs/`, then run **Create Plan**.
4. Run **Build Agent** — generates agent configs via Copilot Chat.
5. Apply changes via the CPS extension, test in the portal, paste output back.
6. Run **Agent Assessment** or **Solution Assessment** to review against best practices.

### Sidebar

| Section | Commands |
|---------|----------|
| **Setup** | Initialise Project, Sync Knowledge |
| **Plan** | Add Requirements, Create Plan |
| **Build** | Build Agent |
| **Assess** | Agent Assessment, Solution Assessment |

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `cpsAgentKit.knowledgeRepoUrl` | `https://github.com/nlloydjenkins/CPSAgentKit` | Knowledge repo URL |
| `cpsAgentKit.knowledgeRepoBranch` | `main` | Branch to pull from |
| `cpsAgentKit.syncOnOpen` | `true` | Auto-sync on workspace open |

---

## License

MIT
