# Agent Workbench for Copilot Studio

Turn GitHub Copilot, or any compatible coding AI, into a disciplined Copilot Studio specialist.

Agent Workbench is not the agent your users run. It is the workspace constitution and tooling layer that guides a coding AI through Copilot Studio solution design, portal preparation, local YAML authoring, Dataverse provisioning, prompt-tool updates, and assessment.

Agent Workbench ships as three packages sharing a common core:

| Package                   | Surface           | Install                                                                     |
| ------------------------- | ----------------- | --------------------------------------------------------------------------- |
| `@cpsagentkit/core`       | Shared library    | Internal dependency                                                         |
| `cpsagentkit`             | VS Code extension | [VSIX from Releases](https://github.com/nlloydjenkins/CPSAgentKit/releases) |
| `@cpsagentkit/mcp-server` | MCP server        | `npx @cpsagentkit/mcp-server`                                               |

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

| Category         | Tools                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Knowledge**    | `cps_list_knowledge_topics`, `cps_get_knowledge`, `cps_get_best_practice`                                           |
| **Parsing**      | `cps_detect_project_state`, `cps_list_agents`, `cps_parse_agent`, `cps_parse_solution`, `cps_find_solution_folders` |
| **Assessment**   | `cps_validate_tool_description`, `cps_compose_review_prompt`                                                        |
| **Build**        | `cps_generate_topic_scaffolds`, `cps_detect_dataverse_mcp`                                                          |
| **Prompt tools** | `cps_parse_prompt_config`, `cps_build_prompt_update`                                                                |

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
cd Agent Workbench && npm install && npm run compile
npm run package:extension && npm run install:vsix
```

### Usage

1. Clone an agent using the CPS extension (agent YAML appears in the workspace).
2. Run **Initialise Agent Workbench Project** — scaffolds folders, syncs knowledge, writes `copilot-instructions.md`.
3. Add requirements to `Requirements/docs/`, then run **Create Plan** to generate `Requirements/spec.md` and `Requirements/architecture.md` for review.
4. Review and refine the generated spec and architecture, then run **Build Agent**. If required setup is missing, Build Agent writes `Requirements/build-checklist.md` as a short action checklist.
5. Run **Copilot Studio: Apply Changes** and **Copilot Studio: Get Changes** when Build Agent asks for a portal round trip, then run **Build Agent** again to continue.
6. Test in the portal, paste output back when needed, then run **Assess Agent**.

### Build Lifecycle

| Phase              | Command or action                              | Purpose                                                                                                                                        |
| ------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Define / Architect | **Create Plan**                            | Generate `Requirements/spec.md` and `Requirements/architecture.md` from requirements docs or an existing cloned agent for review before Build. |
| Build              | **Build Agent**                            | Create safe artifacts, execute schema work through Dataverse MCP when configured, edit local YAML, and write `Requirements/build-checklist.md` only as a short action checklist. |
| Round trip         | **Copilot Studio: Apply Changes/Get Changes** | Push local CPS YAML changes into Copilot Studio and sync portal-generated changes back when Build Agent asks for it.                           |
| Push prompt tools  | Dataverse MCP or `scripts/prompt-sync.mjs` | Update prompt-tool instructions stored in `msdyn_aiconfigurations.msdyn_customconfiguration`.                                                  |
| Assess             | **Assess Agent**                           | Review routing, descriptions, prompts, YAML safety, and platform constraints against best practices.                                           |

Prompt-tool instructions are a special case: the action YAML only controls tool routing metadata. The executable prompt text lives in Dataverse, so Apply Changes is not enough to update it. Agent Workbench provides MCP helpers to parse and rebuild `msdyn_customconfiguration` safely while preserving non-prompt JSON keys, segment shape, and placeholders.

### Sidebar

| Section       | Commands                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| **Workflow**  | Initialise Project, Create Plan, Build Agent, Assess Agent              |
| **Utilities** | Sync Knowledge, Open Build Checklist, Build Demo                         |

### Settings

| Setting                           | Default                                        | Description                 |
| --------------------------------- | ---------------------------------------------- | --------------------------- |
| `cpsAgentKit.knowledgeRepoUrl`    | `https://github.com/nlloydjenkins/CPSAgentKit` | Knowledge repo URL          |
| `cpsAgentKit.knowledgeRepoBranch` | `main`                                         | Branch to pull from         |
| `cpsAgentKit.syncOnOpen`          | `true`                                         | Auto-sync on workspace open |

---

## License

MIT
