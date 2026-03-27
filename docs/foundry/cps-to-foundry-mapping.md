# CPS to Foundry Concept Mapping

The migration rosetta stone — how Copilot Studio concepts translate to Microsoft Foundry and the Agent Framework SDK.

## Agent Architecture

| CPS Concept                               | Foundry Equivalent                                   | Notes                                                                                   |
| ----------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Agent** (GptComponentMetadata)          | `Agent` via `AzureAIClient.as_agent()`               | CPS agent = Foundry agent. Instructions map directly.                                   |
| **Child Agent** (AgentDialog)             | `Executor` in a `WorkflowBuilder` graph              | CPS child agents become separate executors, each wrapping its own agent instance.       |
| **Connected Agent**                       | Separate agent service, invoked via tool or workflow | Connected agents with independent lifecycle become separate deployable services.        |
| **Agent Instructions** (8,000 char limit) | `instructions` parameter (no hard limit)             | Foundry has no character limit on instructions — but clarity still matters.             |
| **Generative Orchestration**              | `WorkflowBuilder` + `Executor` handlers              | CPS auto-routes by description. Foundry routes by explicit graph edges + handler logic. |

## Topics and Routing

| CPS Concept                                  | Foundry Equivalent                       | Notes                                                                                                           |
| -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Topic** (AdaptiveDialog)                   | `@handler` method on an Executor         | Each CPS topic becomes a handler or a distinct code path within an executor.                                    |
| **Topic trigger phrases**                    | N/A — routing is programmatic            | In CPS, the orchestrator uses trigger phrases + descriptions. In Foundry, you implement routing logic yourself. |
| **Topic description**                        | N/A or agent instructions                | CPS uses descriptions for AI-driven routing. In Foundry, the developer codes the routing.                       |
| **System topics** (Fallback, Greeting, etc.) | Default handler / fallback logic in code | Implement as explicit handler branches.                                                                         |
| **Conversational Boosting**                  | RAG implementation in agent code         | Build retrieval + generation explicitly.                                                                        |

## Tools and Actions

| CPS Concept             | Foundry Equivalent                                    | Notes                                                                                                                          |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Prompt Tool**         | Agent with specific instructions (or direct LLM call) | CPS prompt tools are single-purpose AI calls with temperature control. In Foundry, use a dedicated agent or direct model call. |
| **Power Automate Flow** | Python function tool                                  | CPS flows become Python functions registered as tools. The logic moves from Power Automate to code.                            |
| **Connector / Action**  | Python function tool or API client                    | CPS connectors (HTTP, Dataverse, etc.) become Python code calling the same APIs.                                               |
| **MCP Server Tool**     | `MCPStdioTool` / `MCPStreamableHTTPTool`              | Direct mapping — MCP works natively at every level in Foundry (unlike CPS where MCP fails in child agents).                    |
| **Code Interpreter**    | Code execution tool or subprocess                     | CPS code interpreter via prompt tools → implement as sandboxed code execution.                                                 |

## Knowledge and Data

| CPS Concept                              | Foundry Equivalent                     | Notes                                                                                                            |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Knowledge Source** (SharePoint, files) | Azure AI Search index + retrieval tool | CPS handles chunking/indexing automatically. In Foundry, set up Azure AI Search and implement retrieval.         |
| **Uploaded file processing**             | File preprocessing in Python           | CPS uses prompt tools with code interpreter. Foundry uses standard Python libraries (PyPDF2, python-docx, etc.). |
| **Conversation variables**               | Python state in Executor instances     | CPS variables are platform-managed. Foundry state is code-managed.                                               |
| **Conversation history** (10 turns)      | Session with full history              | No platform-imposed context window limit — manage token budget yourself.                                         |

## Multi-Agent Patterns

| CPS Pattern                           | Foundry Pattern                                               | Migration Notes                                                                                     |
| ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Hub-and-spoke** (router + children) | `WorkflowBuilder` with router executor + specialist executors | Map the router's instruction logic to routing code in the router executor's handler.                |
| **Labeled output blocks**             | Direct message passing between executors                      | No summarisation happens in Foundry — labeled blocks become unnecessary. Pass full output directly. |
| **Child completion: "Don't respond"** | `ctx.send_message()` to next executor                         | Children don't auto-respond to users. The graph controls flow.                                      |
| **Evaluator/QC agent**                | QC executor in the workflow                                   | Same pattern — dedicated validation step before final assembly.                                     |
| **Reporter agent**                    | Reporter executor                                             | Same pattern — dedicated formatting step.                                                           |
| **Output preservation**               | N/A — no involuntary summarisation                            | CPS's biggest multi-agent pain point doesn't exist in Foundry.                                      |

## Deployment and Lifecycle

| CPS Concept                   | Foundry Equivalent                          | Notes                                                                                                  |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Apply Changes** (live push) | `docker build` → ACR → Foundry hosted agent | Standard software deployment. Version control and CI/CD by default.                                    |
| **CPS environment**           | Foundry project                             | CPS environments map to Foundry projects.                                                              |
| **Portal-first authoring**    | Code-first authoring                        | Inversion of the workflow. CPS scaffolds in portal, refines in code. Foundry is code-first throughout. |
| **YAML agent config**         | Python agent code                           | CPS agents are YAML. Foundry agents are code.                                                          |

## VS Code Extension Mapping

| CPS Extension Command                           | AI Toolkit / Foundry Extension Equivalent                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `microsoft-copilot-studio.cloneAgent`           | `ai-mlstudio.createNewAgent` — create a new agent project                    |
| `microsoft-copilot-studio.getChanges`           | N/A — code is the source of truth, version controlled with git               |
| `microsoft-copilot-studio.previewChanges`       | `azure-ai-foundry.commandPalette.runAgent` — test locally                    |
| `microsoft-copilot-studio.applyChanges`         | `azure-ai-foundry.commandPalette.deployWorkflow` — deploy to Foundry         |
| `microsoft-copilot-studio.signIn`               | `ai-mlstudio.treeView.models.foundry.selectProject` — select Foundry project |
| `microsoft-copilot-studio.refreshAgentTreeView` | `ai-mlstudio.treeView.agents.refreshFoundryAgents` — refresh agents list     |
| N/A                                             | `ai-mlstudio.openTestTool` — Agent Inspector for interactive debugging       |
| N/A                                             | `ai-mlstudio.command.submitEvaluation` — submit batch evaluation to Foundry  |
| N/A                                             | `ai-mlstudio.triggerFoundryModelDeployment` — deploy model to Foundry        |
| N/A                                             | `ai-mlstudio.modelPlayground` — interactive model testing playground         |

See [ai-toolkit-extension.md](ai-toolkit-extension.md) for the full command and tool reference.

## What You Gain in Migration

- Full control over orchestration — no involuntary summarisation, no routing degradation
- MCP tools work at every level
- Unlimited agent depth (no 2-level restriction)
- No tool count limits
- Built-in evaluation framework
- Standard deployment model with version control and CI/CD
- No dependency on Power Platform licensing

## What You Lose in Migration

- Zero-code authoring for business users
- Built-in SharePoint/Dataverse integration
- Automatic knowledge chunking and indexing
- Visual topic builder
- Power Platform connector ecosystem (must be reimplemented)
- Omnichannel deployment (Teams, web chat, etc.) without additional integration work
