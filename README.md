# CPSAgentKit

Turn GitHub Copilot, or any compatible coding AI, into a disciplined Copilot Studio specialist.

CPSAgentKit is not the agent your users run. It is the workspace constitution and tooling layer that guides a coding AI through Copilot Studio solution design, portal preparation, local YAML authoring, Dataverse provisioning, prompt-tool updates, and assessment.

CPSAgentKit ships as three packages sharing a common core:

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
cd CPSAgentKit && npm install && npm run compile
npm run package:extension && npm run install:vsix
```

### Usage

1. Clone an agent using the CPS extension (agent YAML appears in the workspace).
2. Run **Initialise CPS Project** — scaffolds folders, syncs knowledge, writes `copilot-instructions.md`.
3. Add requirements to `Requirements/docs/`, then run **Pre-Build Agent** to generate `Requirements/spec.md` and `Requirements/architecture.md` for review.
4. Review and refine the generated spec and architecture, then run **Prepare for Build** — validates the architecture, creates `Requirements/build-prep.md`, separates portal-first work from Build work, and enriches the architecture with Dataverse and prompt-tool details.
5. Complete the safe portal setup called out in the runbook, then run **Copilot Studio: Get Changes** so local YAML contains the generated scaffolds.
6. Run **Build Agent** — creates/reconciles Dataverse schema when MCP is configured, edits local CPS YAML, and prepares settings, instructions, topic descriptions, and tool descriptions.
7. Run **Copilot Studio: Apply Changes** to push local YAML back to Copilot Studio.
8. Push AI prompt-tool instruction updates through Dataverse MCP or `scripts/prompt-sync.mjs` when prompt tools are part of the architecture.
9. Test in the portal, paste output back, then run **Agent Assessment** or **Solution Assessment**.

### Build Lifecycle

| Phase              | Command or action                              | Purpose                                                                                                                                        |
| ------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Define / Architect | **Pre-Build Agent** / **Create Plan**          | Generate `Requirements/spec.md` and `Requirements/architecture.md` from requirements docs or an existing cloned agent for review before Build. |
| Prepare            | **Prepare for Build**                          | Produce the pre-build runbook, identify portal-only setup, verify Dataverse MCP readiness, and make the architecture build-ready.              |
| Portal scaffold    | Copilot Studio portal + **Get Changes**        | Create agents, tools, prompt tools, knowledge sources, triggers, and connection scaffolds that must exist before YAML can be safely edited.    |
| Build              | **Build Agent**                                | Execute schema work through Dataverse MCP when required, then edit local YAML safely.                                                          |
| Push YAML          | **Copilot Studio: Apply Changes**              | Push local CPS YAML changes into Copilot Studio.                                                                                               |
| Push prompt tools  | Dataverse MCP or `scripts/prompt-sync.mjs`     | Update prompt-tool instructions stored in `msdyn_aiconfigurations.msdyn_customconfiguration`.                                                  |
| Assess             | **Agent Assessment** / **Solution Assessment** | Review routing, descriptions, prompts, YAML safety, and platform constraints against best practices.                                           |

Prompt-tool instructions are a special case: the action YAML only controls tool routing metadata. The executable prompt text lives in Dataverse, so Apply Changes is not enough to update it. CPSAgentKit provides MCP helpers to parse and rebuild `msdyn_customconfiguration` safely while preserving non-prompt JSON keys, segment shape, and placeholders.

### Sidebar

| Section    | Commands                                       |
| ---------- | ---------------------------------------------- |
| **Setup**  | Initialise Project, Sync Knowledge             |
| **Plan**   | Add Requirements, Pre-Build Agent, Create Plan |
| **Build**  | Prepare for Build, Build Agent                 |
| **Assess** | Agent Assessment, Solution Assessment          |

### Settings

| Setting                           | Default                                        | Description                 |
| --------------------------------- | ---------------------------------------------- | --------------------------- |
| `cpsAgentKit.knowledgeRepoUrl`    | `https://github.com/nlloydjenkins/CPSAgentKit` | Knowledge repo URL          |
| `cpsAgentKit.knowledgeRepoBranch` | `main`                                         | Branch to pull from         |
| `cpsAgentKit.syncOnOpen`          | `true`                                         | Auto-sync on workspace open |

---

## License

MIT
