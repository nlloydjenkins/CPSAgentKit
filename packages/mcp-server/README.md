# @cpsagentkit/mcp-server

**Model Context Protocol server** exposing [CPSAgentKit](https://github.com/nlloydjenkins/CPSAgentKit)'s Copilot Studio knowledge, parsing, and assessment tools to any MCP-aware LLM client (Claude Desktop, VS Code, Cursor, custom agents).

## Install

```bash
# One-shot via npx (no install)
npx @cpsagentkit/mcp-server --transport=stdio

# Or install globally
npm install -g @cpsagentkit/mcp-server
cpsagentkit-mcp --transport=stdio
```

## Transports

- **stdio** (default): for MCP clients that spawn the server as a subprocess
- **HTTP (Streamable)**: for clients that connect to a long-running server

```bash
cpsagentkit-mcp --transport=stdio
cpsagentkit-mcp --transport=http --host=127.0.0.1 --port=3333
```

The HTTP endpoint is `POST /mcp` and follows the MCP Streamable HTTP spec.

## Claude Desktop / MCP client config

Add to your `claude_desktop_config.json` (or equivalent):

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

## Tools

The server registers the following tools:

### Knowledge retrieval

- **`cps_list_knowledge_topics`** — lists every bundled CPS knowledge and best-practice document. Optional `category` filter (`knowledge` | `bestpractices`).
- **`cps_get_knowledge`** — returns the full markdown body of a knowledge document by slug.
- **`cps_get_best_practice`** — returns the full markdown body of a best-practice document by slug.

### Workspace parsing

- **`cps_detect_project_state`** — snapshot of a workspace (initialised? spec/arch present? agents cloned?).
- **`cps_list_agents`** — finds all cloned CPS agent folders in a workspace.
- **`cps_parse_agent`** — reads one cloned agent folder into a structured snapshot (settings, topics, actions, knowledge).
- **`cps_parse_solution`** — reads an exported CPS solution folder (solution.xml + botcomponents/) into agent snapshots plus metadata.
- **`cps_find_solution_folders`** — scans a directory for exported CPS solution folders.

### Assessment

- **`cps_validate_tool_description`** — lint-checks a tool/topic/agent description against CPS prompt-engineering rules.
- **`cps_compose_review_prompt`** — assembles a complete solution review prompt from workspace + bundled rules; scope can be `full` | `prompts` | `descriptions` | `architecture`.

### Build context

- **`cps_generate_topic_scaffolds`** — extracts topic scaffolds from architecture.md.
- **`cps_detect_dataverse_mcp`** — checks for Dataverse MCP configuration in `.vscode/mcp.json`.

## Resources

Every bundled knowledge and best-practice document is also registered as an MCP resource with URI `cpsagentkit://<category>/<slug>`, so clients with resource UIs can browse them without invoking tools.

## License

MIT — see [LICENSE](../../LICENSE).

## Hosted endpoint

A public anonymous instance is hosted on Azure Container Apps:

```
https://ca-mcp-6frsoq6bw5vuk.salmonstone-8b839f60.uksouth.azurecontainerapps.io/mcp
```

(Once DNS is configured, `https://cpsagentkit.codeworks.app/mcp` will resolve to the same endpoint.)

The hosted instance runs with `MCP_HOSTED=1`, which exposes only the tools that don't need access to your local workspace: `cps_list_knowledge_topics`, `cps_get_knowledge`, `cps_get_best_practice`, `cps_validate_tool_description`, `cps_parse_prompt_config`, `cps_build_prompt_update`. For workspace parsing / review composition use the stdio transport described above.

VS Code `.vscode/mcp.json`:

```jsonc
{
  "servers": {
    "cpsagentkit-hosted": {
      "type": "http",
      "url": "https://ca-mcp-6frsoq6bw5vuk.salmonstone-8b839f60.uksouth.azurecontainerapps.io/mcp"
    }
  }
}
```

Deployment details, including how to enable optional API-key auth, live in [`docs/deployment/mcp-server-azure.md`](../../docs/deployment/mcp-server-azure.md).
