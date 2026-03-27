# Multi-Agent Workflows

## Overview

Microsoft Agent Framework provides graph-based workflows via `WorkflowBuilder` for orchestrating multi-agent systems. Unlike CPS's declarative hub-and-spoke model with platform-managed orchestration, Foundry workflows give you full programmatic control over routing, state, and agent interaction.

## Core Concepts

### Executor

An `Executor` is a workflow node that wraps an agent (or any logic). Each executor:

- Has a unique `id`
- Contains one or more `@handler` methods that process incoming messages
- Sends messages to other executors via `ctx.send_message()`
- Yields final output via `ctx.yield_output()`

```python
from agent_framework import Agent, Executor, Message, WorkflowContext, handler

class MyExecutor(Executor):
    agent: Agent

    def __init__(self, client: AzureAIClient, id: str = "my_executor") -> None:
        self.agent = client.as_agent(
            name="MyAgent",
            instructions="...",
        )
        super().__init__(id=id)

    @handler
    async def handle(self, messages: list[Message], ctx: WorkflowContext[list[Message]]) -> None:
        response = await self.agent.run(messages)
        messages.extend(response.messages)
        await ctx.send_message(messages)
```

### WorkflowBuilder

```python
from agent_framework import WorkflowBuilder

workflow = (
    WorkflowBuilder(start_executor=orchestrator)  # NOT .set_start_executor()
    .add_edge(orchestrator, specialist_a)
    .add_edge(orchestrator, specialist_b)
    .add_edge(specialist_a, orchestrator)
    .add_edge(specialist_b, orchestrator)
    .build()
)
```

- Use `start_executor=...` in the constructor — not `.set_start_executor()`.
- Edges define allowed message routes between executors.
- The workflow runs until an executor calls `ctx.yield_output()`.

### Running a Workflow

```python
async for event in workflow.run("Start the task.", stream=True):
    if event.type == "output" and isinstance(event.data, str):
        print(event.data)
```

## Multi-Agent Patterns

### Sequential Pipeline (A → B → C)

Each executor forwards to the next in sequence.

```python
workflow = (
    WorkflowBuilder(start_executor=step_a)
    .add_edge(step_a, step_b)
    .add_edge(step_b, step_c)
    .build()
)
```

### Hub-and-Spoke (Router → Specialists)

A central router dispatches to specialist executors and collects results.

```python
workflow = (
    WorkflowBuilder(start_executor=router)
    .add_edge(router, billing)
    .add_edge(router, support)
    .add_edge(billing, router)
    .add_edge(support, router)
    .build()
)
```

### Iterative Loop (Writer ↔ Reviewer)

Two executors loop messages until a condition is met (e.g., turn count).

```python
workflow = (
    WorkflowBuilder(start_executor=teacher)
    .add_edge(teacher, student)
    .add_edge(student, teacher)
    .build()
)
```

End the loop by calling `ctx.yield_output()` instead of `ctx.send_message()`.

## Key Differences from CPS Multi-Agent

| Aspect            | CPS                                            | Foundry                                     |
| ----------------- | ---------------------------------------------- | ------------------------------------------- |
| Orchestration     | Platform-managed generative orchestration      | Developer-coded workflow graph              |
| Routing           | Description-driven, AI-selected                | Explicit edges + handler logic              |
| Agent depth       | Max 2 levels (parent → child, no deeper)       | Unlimited graph depth                       |
| Response handling | Auto-summarised by parent                      | Full control — no involuntary summarisation |
| Citations         | Stripped in handoffs                           | Preserved (developer-managed)               |
| Tool limits       | 128 hard / 25–30 practical per agent           | No platform limit                           |
| MCP in children   | Not invoked through parent orchestration       | Works — each executor owns its tools        |
| State             | Conversation variables, limited context window | Full programmatic state in executors        |

## Workflow as Agent (HTTP Server)

Wrap a workflow as an agent to serve it over HTTP:

```python
agent = workflow.as_agent()  # WorkflowBuilder().build().as_agent()
await from_agent_framework(agent).run_async()
```

This makes the workflow deployable as a Foundry hosted agent.
