# Foundry Platform Constraints

## SDK Version Sensitivity

- The Agent Framework SDK is in active preview with frequent breaking renames between versions.
- **Always pin versions.** `agent-framework-azure-ai==1.0.0rc3` and `agent-framework-core==1.0.0rc3`.
- API names differ between versions: `as_agent()` vs `create_agent()`, `AgentResponseUpdate` vs `AgentRunResponseUpdate`, `run(..., stream=True)` vs `run_stream()`.
- Pin hosting packages too: `azure-ai-agentserver-agentframework==1.0.0b16`.

## Client Instantiation

- Use `AzureAIClient` by default — not `AzureAIAgentClient` (deprecated v1) or `AzureOpenAIChatClient` (only for direct Azure OpenAI endpoints).
- **Separate client instances per agent** — the agent name is set at the client level. Reusing a client across agents will cause naming conflicts.
- Use async `DefaultAzureCredential` from `azure.identity.aio`, not the sync version.

## WorkflowBuilder

- Use `WorkflowBuilder(start_executor=...)` — not `.set_start_executor()`.
- Edges must be explicitly defined. There is no AI-driven auto-routing (unlike CPS).
- A workflow runs until an executor calls `ctx.yield_output()`. Without this, the workflow will not terminate.

## Streaming

- Use `agent.run("input", stream=True)` — not `agent.run_stream()`.
- Always call `await stream.get_final_response()` after consuming the stream to finalise.
- Forgetting `get_final_response()` may leave resources un-cleaned.

## Environment Variables

- Use `load_dotenv(override=False)` so Foundry runtime variables take precedence over `.env`.
- Required variables: `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_MODEL_DEPLOYMENT_NAME`.

## HTTP Server

- The HTTP server pattern is mandatory for deployment as a Foundry hosted agent.
- The starter executor must accept `list[Message]` for HTTP request handling.
- Make HTTP server mode the default (no flag required) for compatibility with containerisation and Foundry deployment.

## Python Requirements

- Python 3.10 or higher required.
- Always use a workspace-local virtual environment — never install into global/system Python.

## Evaluation

- Evaluation datasets must be JSONL format.
- Custom evaluators require Azure AI Projects SDK v2 (`azure-ai-projects>=2.0.0b2`).
- Built-in evaluators may require specific data columns — check required fields before creating datasets.

## Copilot Studio Connected-Agent Boundary

- Copilot Studio can connect to Microsoft Foundry agents as external connected agents in public preview. The connection requires the Foundry project endpoint URL and agent ID.
- Current Copilot Studio documentation limits this path to agents created in the new Microsoft Foundry portal. Agents created in the previous portal can fail during connection or invocation with errors such as `404 - Version not found`.
- A successful Foundry playground/test run does not prove the Copilot Studio connected-agent path is healthy. Copilot adds its own orchestration, auth, channel, safety, and response-brokering layers.
- When a Foundry agent works directly but fails through Copilot Studio, check connected-agent auth, private networking, model/Search connection access, stale agent version binding, and output shape before changing retrieval/indexing.
- Prefer a Copilot-safe wrapper for production interop: compact plain text, bounded length, no raw JSON/CSV, no large markdown tables, no tool traces, and clarifying questions when result sets are large.
- A Copilot Studio agent can invoke a connected Foundry agent, but it cannot manage Foundry agents unless explicit management tools/APIs with appropriate RBAC are added.
