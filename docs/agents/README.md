# Agent Workbench Docs Q&A Agent — React App Integration

This folder packages everything a standalone React chat app needs to wire up the **Agent Workbench Docs Q&A Agent** against the `cpsagentkit-mcp` server.

## Files

- [docs-qa-agent-system-prompt.md](./docs-qa-agent-system-prompt.md) — human-readable copy of the system prompt. Source of truth for the persona text lives in [`packages/mcp-server/src/prompts/docsQaAgent.ts`](../../packages/mcp-server/src/prompts/docsQaAgent.ts) and is served by the MCP server as a `prompts/get` for the prompt named `cps_docs_qa_agent`.
- [docs-qa-agent.config.json](./docs-qa-agent.config.json) — declarative manifest the React app can import/fetch. Lists the MCP server, allowed tools, disallowed tools, suggested model hints, and UI starter questions.

## Architecture

```
React UI ──► LLM API (OpenAI / Azure OpenAI / Foundry / Anthropic / …)
   │             │
   │             ▼
   └────────► MCP client ──► cpsagentkit-mcp (hosted on Azure Container Apps,
                              │                streamable HTTP)
                              ├─ prompt:  cps_docs_qa_agent
                              ├─ tool:    cps_search_docs
                              ├─ tool:    cps_list_knowledge_topics
                              ├─ tool:    cps_get_knowledge
                              └─ tool:    cps_get_best_practice
```

The React app does not need to ship the system prompt text. On startup it should:

1. Connect to the hosted MCP endpoint (see [MCP transport](#mcp-transport) below).
2. Call `prompts/get` with name `cps_docs_qa_agent` and use the returned text as the LLM system prompt.
3. Expose **only** the four tools listed in `allowedTools` to the LLM (filter the `tools/list` response). All other Agent Workbench tools must be hidden or rejected so the agent stays a pure Q&A assistant.
4. Forward the LLM's `tools/call` requests to the MCP server and round-trip results back into the conversation.

## MCP transport

The server is hosted on Azure Container Apps and speaks the [streamable HTTP MCP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http):

```
https://ca-mcp-6frsoq6bw5vuk.salmonstone-8b839f60.uksouth.azurecontainerapps.io/mcp
```

The React app connects to this URL directly via an MCP HTTP client — no Node proxy, no Electron shell, no stdio. CORS, auth, and rate limits are enforced by the Container App, not the client.

If you need to run against a local build instead, swap `mcpServer.url` in [docs-qa-agent.config.json](./docs-qa-agent.config.json) for your dev endpoint (e.g. `http://localhost:3333/mcp`).

## Minimal wiring sketch (pseudo-code)

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import config from "./docs-qa-agent.config.json";

const transport = new StreamableHTTPClientTransport(
  new URL(config.mcpServer.url),
);
const mcp = new Client({ name: "docs-qa-app", version: "1.0.0" });
await mcp.connect(transport);

const prompt = await mcp.getPrompt({ name: config.mcpServer.promptName });
const systemPrompt = prompt.messages[0].content.text;

const allTools = await mcp.listTools();
const tools = allTools.tools.filter((t) =>
  config.allowedTools.includes(t.name),
);

// Pass systemPrompt + tools into your LLM call,
// then route any tools/call requests back through mcp.callTool({ name, arguments }).
```

## Updating the persona

Edit [`packages/mcp-server/src/prompts/docsQaAgent.ts`](../../packages/mcp-server/src/prompts/docsQaAgent.ts), rebuild the MCP server, and mirror the change into [docs-qa-agent-system-prompt.md](./docs-qa-agent-system-prompt.md). The React app will pick up the new prompt automatically on next session via `prompts/get`.
