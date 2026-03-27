# Microsoft Agent Framework SDK

## Overview

Microsoft Agent Framework is the unified open-source SDK for building AI agents and multi-agent workflows. It supports Python and .NET, with first-class integration into Microsoft Foundry (formerly Azure AI Foundry).

Key capabilities:

- Single agents with LLM backing (Foundry, Azure OpenAI, OpenAI)
- Graph-based workflows for multi-step, multi-agent orchestration
- Function tools and MCP server integration
- Session-based multi-turn conversation
- HTTP server hosting for production deployment

## SDK Version Pinning

The SDK is in preview with frequent breaking renames. **Always pin versions.**

### Python (requires 3.10+)

```bash
pip install agent-framework-azure-ai==1.0.0rc3 agent-framework-core==1.0.0rc3
```

For HTTP server hosting:

```bash
pip install azure-ai-agentserver-agentframework==1.0.0b16 azure-ai-agentserver-core==1.0.0b16
```

### .NET (use `--prerelease`)

```bash
dotnet add package Microsoft.Agents.AI.AzureAI --prerelease
dotnet add package Microsoft.Agents.AI.OpenAI --prerelease
dotnet add package Microsoft.Agents.AI.Workflows --prerelease
```

## Client Patterns

### Default: AzureAIClient (Foundry project endpoint)

```python
from agent_framework.azure import AzureAIClient
from azure.identity.aio import DefaultAzureCredential  # must use aio (async) version

async with (
    DefaultAzureCredential() as credential,
    AzureAIClient(
        project_endpoint="<your-foundry-project-endpoint>",
        model_deployment_name="<your-foundry-model-deployment>",
        credential=credential,
    ).as_agent(
        name="MyAgent",
        instructions="You are a helpful agent.",
    ) as agent,
):
    ...
```

### Alternative: AzureOpenAIChatClient (Azure OpenAI direct)

```python
from agent_framework.azure import AzureOpenAIChatClient
from azure.identity import DefaultAzureCredential

AzureOpenAIChatClient(
    endpoint="<your-azure-openai-endpoint>",
    deployment_name="<your-deployment-name>",
    credential=DefaultAzureCredential(),
).as_agent(name="MyAgent", instructions="...")
```

### Critical Rules

- **Use `as_agent()`** — not legacy `create_agent()`.
- **Use `AzureAIClient`** by default — not `AzureAIAgentClient` (legacy v1) or `AzureOpenAIChatClient` (unless targeting Azure OpenAI directly).
- **Separate client instances per agent** — agent name is set at the client level. Do NOT reuse the same client instance across agents.
- **Async credentials** — use `from azure.identity.aio import DefaultAzureCredential`.

## Streaming

```python
stream = agent.run("hello", stream=True)  # NOT run_stream()
async for chunk in stream:
    if chunk.text:
        print(chunk.text, end="", flush=True)
print("\n")
await stream.get_final_response()  # MUST call to finalise
```

- Use `run(..., stream=True)` — not `run_stream()`.
- Always call `await stream.get_final_response()` at the end.

## Sessions (Multi-Turn)

```python
session = agent.create_session()  # default in-memory store
result = await agent.run("first message", session=session)
# ... later ...
result = await agent.run("follow-up", session=session)
```

Session persistence across conversations. Default is in-memory; server-side conversation stores also supported.

## Environment Variables

Use `load_dotenv(override=False)` so Foundry runtime environment variables take precedence over local `.env` in deployed environments.

```
FOUNDRY_PROJECT_ENDPOINT=<project-endpoint>
FOUNDRY_MODEL_DEPLOYMENT_NAME=<model-deployment-name>
```
