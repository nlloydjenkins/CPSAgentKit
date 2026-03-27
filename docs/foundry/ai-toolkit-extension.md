# AI Toolkit for VS Code

## Overview

The **AI Toolkit** (`ms-windows-ai-studio.windows-ai-studio`) is the primary VS Code extension for building, testing, debugging, and deploying agents to Microsoft Foundry. It is the Foundry equivalent of the **Copilot Studio VS Code extension** — just as the CPS extension lets you clone, edit, and apply CPS agents from VS Code, the AI Toolkit lets you create, run, inspect, and deploy Foundry agents from VS Code.

**Extension ID:** `ms-windows-ai-studio.windows-ai-studio`
**Current version (installed):** 0.34.0

There is also a companion extension — **Microsoft Foundry** (`teamsdevapp.vscode-ai-foundry`) — which provides project management, resource browsing, and deployment commands. Both extensions work together.

## CPS Extension ↔ AI Toolkit Comparison

| CPS Extension                       | AI Toolkit / Foundry Extension Equivalent  |
| ----------------------------------- | ------------------------------------------ |
| Clone Agent                         | Create New Agent / Agent Builder           |
| Edit YAML in VS Code                | Edit Python code in VS Code                |
| Preview Changes (diff local/remote) | Run Agent (local testing via agentdev CLI) |
| Get Changes (pull from CPS)         | N/A (code is the source of truth)          |
| Apply Changes (push to CPS env)     | Deploy Workflow / Deploy Hosted Agent      |
| Portal-first, refine in VS Code     | Code-first, deploy from VS Code            |
| Agent assessment via CPSAgentKit    | Evaluation via Foundry eval framework      |

## Key VS Code Commands

### AI Toolkit Commands (`ai-mlstudio.*`)

| Command ID                                          | Description                                          |
| --------------------------------------------------- | ---------------------------------------------------- |
| `ai-mlstudio.models`                                | Open Model Catalog — browse and select AI models     |
| `ai-mlstudio.modelPlayground`                       | Open Model Playground — interactive model testing    |
| `ai-mlstudio.openTestTool`                          | Open Agent Inspector — interactive debugging/testing |
| `ai-mlstudio.promptBuilder`                         | Open Agent Builder — visual agent design             |
| `ai-mlstudio.createNewAgent`                        | Create a new agent project                           |
| `ai-mlstudio.agentBuilder`                          | Open Agent Builder                                   |
| `ai-mlstudio.setupAIModel`                          | Set up AI model configuration                        |
| `ai-mlstudio.triggerFoundryModelDeployment`         | Deploy a model to Microsoft Foundry                  |
| `ai-mlstudio.command.submitEvaluation`              | Submit evaluation to Microsoft Foundry               |
| `ai-mlstudio.evaluation.generateTestCases`          | Generate test cases with Copilot                     |
| `ai-mlstudio.installFoundrySkill`                   | Install/update the microsoft-foundry Copilot skill   |
| `ai-mlstudio.toolCatalog`                           | Browse tool catalog (MCP servers, function tools)    |
| `ai-mlstudio.mcp.addServer`                         | Add an MCP server                                    |
| `ai-mlstudio.mcp.createNewServer`                   | Create a new MCP server                              |
| `ai-mlstudio.treeView.agents.refreshLocalAgents`    | Refresh local agents list                            |
| `ai-mlstudio.treeView.agents.refreshFoundryAgents`  | Refresh Foundry agents list                          |
| `ai-mlstudio.treeView.models.foundry.selectProject` | Select Foundry project                               |

### Microsoft Foundry Extension Commands (`azure-ai-foundry.*`)

| Command ID                                                      | Description                                |
| --------------------------------------------------------------- | ------------------------------------------ |
| `azure-ai-foundry.commandPalette.deployWorkflow`                | Deploy workflow to Foundry as hosted agent |
| `azure-ai-foundry.commandPalette.createProject`                 | Create a new Foundry project               |
| `azure-ai-foundry.commandPalette.llmDeploy`                     | Deploy an LLM model                        |
| `azure-ai-foundry.commandPalette.runAgent`                      | Run agent locally                          |
| `azure-ai-foundry.commandPalette.runInContainerAgentPlayground` | Run agent in container playground          |
| `azure-ai-foundry.commandPalette.createMultiAgentWorkflow`      | Create multi-agent workflow                |
| `azure-ai-foundry.viewContext.createAgent`                      | Create agent from resources view           |
| `azure-ai-foundry.viewContext.createPromptAgent`                | Create prompt agent from resources view    |
| `azure-ai-foundry.editorTitle.deployYamlWorkflow`               | Deploy YAML workflow from editor           |
| `azure-ai-foundry.editorTitle.deployPromptAgent`                | Deploy prompt agent from editor            |
| `azure-ai-foundry.viewContext.openAgentCodeFile`                | Open agent code file                       |
| `azure-ai-foundry.viewContext.openHostedAgentCodeFile`          | Open hosted agent code file                |

## Copilot Chat Tools (Language Model Tools)

The AI Toolkit exposes tools that GitHub Copilot can call during chat. These are the Foundry equivalent of CPSAgentKit's knowledge injection — they give Copilot real-time access to Foundry best practices, code samples, and project resources.

| Tool ID                                       | Purpose                                                      |
| --------------------------------------------- | ------------------------------------------------------------ |
| `aitk-get_agent_code_gen_best_practices`      | SDK best practices, version pins, coding patterns            |
| `aitk-get_ai_model_guidance`                  | Model selection guidance and comparison                      |
| `aitk-get_agent_model_code_sample`            | Code samples for agent creation                              |
| `aitk-list_foundry_models`                    | List user's available Foundry projects and model deployments |
| `aitk-agent_as_server`                        | Best practices for HTTP server hosting pattern               |
| `aitk-add_agent_debug`                        | VS Code debug configuration templates                        |
| `aitk-get_tracing_code_gen_best_practices`    | Tracing and telemetry instrumentation patterns               |
| `aitk-get_evaluation_code_gen_best_practices` | Evaluation code generation best practices                    |
| `aitk-evaluation_agent_runner_best_practices` | Agent runner patterns for evaluation                         |
| `aitk-evaluation_planner`                     | Guided evaluation metric and dataset planning                |
| `aitk-get_custom_evaluator_guidance`          | Custom evaluator creation guidance                           |
| `aitk-convert_declarative_agent_to_code`      | Convert declarative agent specs to runnable code             |

## Built-in Agents

The AI Toolkit ships with an **AIAgentExpert** agent that handles the full lifecycle:

- **Agent Creation** — scaffold new agent/workflow projects
- **Model Selection** — recommend and compare AI models via `aitk-list_foundry_models` and `aitk-get_ai_model_guidance`
- **Tracing** — add OpenTelemetry instrumentation
- **Evaluation** — set up batch eval with built-in and custom evaluators
- **Deployment** — deploy to Foundry via `azure-ai-foundry.commandPalette.deployWorkflow`

## Extension Settings

| Setting                                   | Description                                             |
| ----------------------------------------- | ------------------------------------------------------- |
| `windowsaistudio.tracingGrpcPort`         | OpenTelemetry OTLP gRPC receiver port                   |
| `windowsaistudio.tracingHttpPort`         | OpenTelemetry OTLP HTTP receiver port                   |
| `windowsaistudio.openAIInferencePort`     | Local OpenAI inference HTTP port                        |
| `windowsaistudio.autoCheckFoundrySkill`   | Auto-install/update the microsoft-foundry Copilot skill |
| `windowsaistudio.remoteInfereneEndpoints` | List of remote inference endpoints                      |

## Developer Workflow (Foundry via AI Toolkit)

The end-to-end workflow mirrors the CPS extension workflow, reframed for code-first:

1. **Create** — `ai-mlstudio.createNewAgent` or `azure-ai-foundry.commandPalette.createMultiAgentWorkflow` scaffolds the project
2. **Configure Model** — `ai-mlstudio.treeView.models.foundry.selectProject` → select project, then `ai-mlstudio.triggerFoundryModelDeployment` if needed
3. **Edit Code** — Python files in VS Code, with Copilot using `aitk-*` tools for guidance
4. **Test Locally** — `ai-mlstudio.openTestTool` opens Agent Inspector; `azure-ai-foundry.commandPalette.runAgent` runs the agent
5. **Evaluate** — `ai-mlstudio.command.submitEvaluation` submits batch eval to Foundry
6. **Deploy** — `azure-ai-foundry.commandPalette.deployWorkflow` deploys as hosted agent

This is the equivalent of: Clone → Edit YAML → Preview Changes → Apply Changes in CPS.

## Integration Points for CPSAgentKit

When implementing the Migrate to Foundry feature, these are the key programmatic integration points:

```typescript
// Check if AI Toolkit is installed
const aiToolkit = vscode.extensions.getExtension(
  "ms-windows-ai-studio.windows-ai-studio",
);
const foundryExt = vscode.extensions.getExtension(
  "teamsdevapp.vscode-ai-foundry",
);

// Open Agent Inspector for testing the migrated agent
await vscode.commands.executeCommand("ai-mlstudio.openTestTool", {
  triggeredFrom: "copilot",
  port: 8088,
});

// Open Model Catalog for model selection
await vscode.commands.executeCommand("ai-mlstudio.models", {
  triggeredFrom: "copilot",
  initialProviderFilter: "Microsoft Foundry",
});

// Deploy the migrated workflow
await vscode.commands.executeCommand(
  "azure-ai-foundry.commandPalette.deployWorkflow",
);

// Deploy a model if needed
await vscode.commands.executeCommand(
  "ai-mlstudio.triggerFoundryModelDeployment",
  {
    triggeredFrom: "copilot",
    modelName: "<model-name>",
  },
);
```
