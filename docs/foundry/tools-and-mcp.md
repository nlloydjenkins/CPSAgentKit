# Tools and MCP

## Function Tools

Define Python functions with type annotations and docstrings. The agent framework auto-generates the JSON schema for the LLM.

```python
from random import randint
from typing import Annotated

def get_weather(
    location: Annotated[str, "The location to get the weather for."],
) -> str:
    """Get the weather for a given location."""
    conditions = ["sunny", "cloudy", "rainy", "stormy"]
    return f"The weather in {location} is {conditions[randint(0, 3)]} with a high of {randint(10, 30)}°C."

# Register tools when creating the agent
client.as_agent(
    name="WeatherAgent",
    instructions="You help with weather queries.",
    tools=[get_weather],
)
```

### Best Practices

- Use `Annotated[type, "description"]` for parameter descriptions — the LLM uses these for tool selection.
- Use clear docstrings — these become the tool description.
- Keep tool functions focused on a single operation.
- Return strings — the LLM processes the return value as text context.

## MCP (Model Context Protocol) Tools

### Stdio MCP Server

```python
from agent_framework import MCPStdioTool

MCPStdioTool(
    name="Playwright MCP",
    description="Browser automation capabilities using Playwright",
    command="npx",
    args=["-y", "@playwright/mcp@latest"],
    load_prompts=False,  # False if using tools only
)
```

### Streamable HTTP MCP Server

```python
from agent_framework import MCPStreamableHTTPTool

MCPStreamableHTTPTool(
    name="Microsoft Learn MCP",
    description="Official Microsoft documentation",
    url="https://learn.microsoft.com/api/mcp",
    load_prompts=False,
)
```

### Registration

Pass MCP tools in the `tools` list alongside function tools:

```python
client.as_agent(
    name="MyAgent",
    instructions="...",
    tools=[get_weather, mcp_playwright, mcp_learn],
)
```

## Key Difference from CPS

In CPS, MCP tools on child agents are NOT invoked when called through parent orchestration. In Foundry, each executor owns its tools directly — MCP tools work at every level of the workflow graph without the CPS workaround of hoisting tools to the parent.
