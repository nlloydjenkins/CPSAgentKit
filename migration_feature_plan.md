# Migration Feature Plan: Migrate to Foundry

**Date:** 2026-03-27
**Status:** Draft
**Scope:** New extension command + knowledge base + scaffolding logic

---

## 1. Problem

Customers build complex Copilot Studio agents using CPSAgentKit — multi-agent architectures with hub-and-spoke patterns, prompt tools, knowledge sources, and Power Automate flows. Some of these customers hit CPS platform limitations that cannot be worked around:

- Response summarisation stripping detail in parent–child handoffs
- MCP tools not firing through parent orchestration
- No agent depth beyond 2 levels
- Tool routing degradation above 25–30 tools
- No built-in evaluation framework
- No standard CI/CD or version control (live-editing only)
- 8,000-character instruction limit forcing premature decomposition

Microsoft Foundry (via the Agent Framework SDK) removes these constraints. The feature enables a CPS agent owner to generate a functionally equivalent Foundry project directly from their existing CPS workspace — same agents, same logic, same tools, but running on Foundry infrastructure with full programmatic control.

## 2. Users

Same CPSAgentKit users: developers and power users building agents in VS Code. They have an existing CPS agent in the workspace (cloned via the CPS VS Code extension) and want to explore or commit to Foundry as the runtime. They may not be Python developers — the generated code should be production-ready and well-documented.

## 3. What It Does

### New Command: Migrate to Foundry

`cpsAgentKit.migrateToFoundry` — reads the existing CPS agent's YAML configuration, spec, architecture, and knowledge, then scaffolds a complete Foundry project in a `foundry/` folder within the workspace.

### Generated Project Structure

```
project-root/
├── foundry/
│   ├── agents/
│   │   ├── orchestrator.py          ← maps to CPS parent agent
│   │   ├── specialist_a.py          ← maps to each CPS child agent
│   │   ├── specialist_b.py
│   │   └── ...
│   ├── tools/
│   │   ├── tool_a.py                ← maps to CPS Power Automate flows / connectors
│   │   ├── tool_b.py
│   │   └── mcp_servers.py           ← MCP tool registrations
│   ├── knowledge/
│   │   └── (retrieval setup / index config)
│   ├── eval/
│   │   ├── datasets/                ← test datasets (JSONL)
│   │   └── run_eval.py              ← evaluation runner
│   ├── main.py                      ← HTTP server entry point
│   ├── workflow.py                   ← WorkflowBuilder graph definition
│   ├── requirements.txt             ← pinned SDK versions
│   ├── .env.template                ← environment variable template
│   ├── Dockerfile                   ← containerisation for Foundry deployment
│   ├── README.md                    ← migration notes + setup guide
│   └── .vscode/
│       ├── launch.json              ← debug configurations
│       └── tasks.json               ← build tasks
├── agents/                           ← existing CPS YAML (untouched)
├── Requirements/
│   ├── spec.md                       ← existing (untouched)
│   └── architecture.md              ← existing (untouched)
└── .cpsagentkit/                     ← existing (untouched)
```

### What Gets Migrated

| CPS Component             | Foundry Output                                                 | How                                                                     |
| ------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Parent agent instructions | `agents/orchestrator.py` — instructions parameter              | Direct text migration                                                   |
| Child agent instructions  | `agents/specialist_*.py` — instructions parameter per executor | Direct text migration                                                   |
| Topic trigger logic       | `@handler` methods + routing logic in orchestrator             | Decompose trigger descriptions into handler dispatch                    |
| Topic descriptions        | Comments + handler docstrings                                  | Preserved as documentation                                              |
| Power Automate flows      | `tools/tool_*.py` — skeleton function tools                    | Generated as stubs with TODO markers — logic must be reimplemented      |
| Connector actions         | `tools/tool_*.py` — skeleton function tools                    | Generated as stubs with API client patterns                             |
| MCP servers               | `tools/mcp_servers.py` — MCPStdioTool / MCPStreamableHTTPTool  | Direct migration — MCP config maps cleanly                              |
| Knowledge sources         | `knowledge/` folder + retrieval notes                          | Generated as setup instructions — requires Azure AI Search provisioning |
| Prompt tools              | Dedicated agent or direct LLM call                             | Generated as small focused agents                                       |
| Agent variables           | Python state on Executor classes                               | Generated as instance attributes                                        |
| Multi-agent graph         | `workflow.py` — WorkflowBuilder with edges                     | Generated from architecture.md + detected child agents                  |

### What Requires Manual Work

- **Power Automate flow logic** — generated as tool stubs with the correct interface. The actual business logic must be reimplemented in Python (or connected to an equivalent API).
- **Knowledge retrieval** — requires provisioning Azure AI Search and indexing content. Generated as setup instructions, not working code.
- **Connector credentials** — `.env.template` generated with placeholder variables. Developer fills in Foundry project endpoint and model deployment.
- **Power Fx expressions** — CPS-specific expressions in topics are flagged with TODO comments and the original expression preserved.

## 4. Implementation Plan

### Phase 1: Foundry Knowledge Base (this PR)

**Goal:** Establish the knowledge foundation that makes GitHub Copilot Foundry-aware.

| Task | Description                                                                                       | Files                                    |
| ---- | ------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1.1  | Create `docs/foundry/` folder with Foundry knowledge docs                                         | `docs/foundry/*.md`                      |
| 1.2  | Cover: Agent Framework SDK, multi-agent workflows, tools/MCP, deployment, evaluation, constraints | 7 knowledge files                        |
| 1.3  | Create CPS-to-Foundry concept mapping (migration rosetta stone)                                   | `docs/foundry/cps-to-foundry-mapping.md` |

**Status: Done** — all 7 files created in `docs/foundry/`.

### Phase 2: CPS Agent Parser

**Goal:** Read and understand the CPS agent's YAML structure programmatically.

| Task | Description                                                                                                                                                                      | Files                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 2.1  | Create a CPS YAML parser that extracts agent metadata, instructions, child agents, topics, triggers, tools, knowledge sources, and variables from the CPS extension's YAML files | `src/services/cpsAgentParser.ts`  |
| 2.2  | Define a typed `CpsAgentModel` interface representing the parsed agent structure                                                                                                 | `src/services/cpsAgentParser.ts`  |
| 2.3  | Handle both single-agent and multi-agent (parent + children) architectures                                                                                                       | Same file                         |
| 2.4  | Extract Power Automate flow references and connector action bindings                                                                                                             | Same file                         |
| 2.5  | Unit tests for the parser against sample YAML                                                                                                                                    | `src/test/cpsAgentParser.test.ts` |

The existing `solutionFileParser.ts` and `fileUtils.ts` already handle reading CPS YAML — this phase extends that into a structured model.

### Phase 3: Foundry Project Generator

**Goal:** Transform the parsed CPS agent model into a runnable Foundry project.

| Task | Description                                                                                                                    | Files                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| 3.1  | Create Foundry code generator that takes `CpsAgentModel` and produces Python files                                             | `src/services/foundryGenerator.ts` |
| 3.2  | Agent file generation — one Python file per CPS agent with `AzureAIClient.as_agent()`, instructions, and tools                 | Template-driven generation         |
| 3.3  | Workflow file generation — `WorkflowBuilder` graph from architecture.md + detected child agents                                | `workflow.py` template             |
| 3.4  | Tool stub generation — function tool skeletons from Power Automate flow references + connector actions                         | `tools/*.py` templates             |
| 3.5  | MCP tool migration — direct mapping of CPS MCP references to `MCPStdioTool` / `MCPStreamableHTTPTool`                          | `tools/mcp_servers.py` template    |
| 3.6  | Main entry point — HTTP server via `from_agent_framework`                                                                      | `main.py` template                 |
| 3.7  | Supporting files — `requirements.txt`, `.env.template`, `Dockerfile`, `.vscode/launch.json`, `.vscode/tasks.json`, `README.md` | Static templates                   |
| 3.8  | Evaluation scaffolding — eval runner + empty dataset folder                                                                    | `eval/` template                   |

### Phase 4: Extension Command

**Goal:** Wire the parser and generator into a VS Code command.

| Task | Description                                                             | Files                                   |
| ---- | ----------------------------------------------------------------------- | --------------------------------------- |
| 4.1  | Register `cpsAgentKit.migrateToFoundry` command                         | `src/extension.ts`, `package.json`      |
| 4.2  | Command handler: validate workspace has CPS agent + spec + architecture | `src/commands/migrateToFoundry.ts`      |
| 4.3  | Parse CPS agent using Phase 2 parser                                    | Same file                               |
| 4.4  | Generate Foundry project using Phase 3 generator                        | Same file                               |
| 4.5  | Show migration summary: what was migrated, what needs manual work       | VS Code notification + generated README |
| 4.6  | Non-destructive: never modify existing CPS files, spec, or architecture | Enforced in command handler             |

### Phase 5: Knowledge Sync Integration

**Goal:** Include Foundry knowledge in the existing knowledge sync and copilot-instructions.md generation.

| Task | Description                                                                                                                | Files                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 5.1  | Add `docs/foundry/` to the knowledge sync process so Foundry docs are copied to `.cpsagentkit/foundry/`                    | `src/services/knowledgeSync.ts`         |
| 5.2  | Extend `copilot-instructions.md` generation to include Foundry knowledge when a `foundry/` project exists in the workspace | `src/services/instructionsGenerator.ts` |
| 5.3  | Update `detectProjectState` to detect Foundry project presence                                                             | `src/services/projectState.ts`          |

### Phase 6: AI Toolkit & Foundry Extension Integration

**Goal:** Leverage the AI Toolkit (`ms-windows-ai-studio.windows-ai-studio`) and Microsoft Foundry (`teamsdevapp.vscode-ai-foundry`) VS Code extensions for model selection, testing, and deployment. These extensions are the Foundry equivalent of the CPS VS Code extension — Clone/Get/Apply becomes Create/Run/Deploy.

| Task | Description                                                                                                                                                                     | Files                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 6.1  | Detect if both extensions are installed; prompt to install if either is missing                                                                                                 | `src/commands/migrateToFoundry.ts` |
| 6.2  | After scaffolding, offer to select a Foundry project via `ai-mlstudio.treeView.models.foundry.selectProject` and deploy a model via `ai-mlstudio.triggerFoundryModelDeployment` | Integration point                  |
| 6.3  | Offer local testing via `ai-mlstudio.openTestTool` (Agent Inspector) and `azure-ai-foundry.commandPalette.runAgent`                                                             | Post-scaffolding action            |
| 6.4  | Offer deployment trigger via `azure-ai-foundry.commandPalette.deployWorkflow`                                                                                                   | Post-scaffolding action            |
| 6.5  | Offer evaluation submission via `ai-mlstudio.command.submitEvaluation`                                                                                                          | Post-scaffolding action            |
| 6.6  | Document the extension dependency and recommended workflow in `foundry/README.md` and `docs/foundry/ai-toolkit-extension.md`                                                    | Generated README + knowledge doc   |

## 5. Design Decisions

### Why a `foundry/` subfolder (not a separate workspace)?

The CPS YAML files, spec, architecture, and knowledge all stay in the same workspace. The developer works with both the CPS original and the Foundry migration side by side. Copilot has full visibility of both.

### Why Python (not .NET)?

Python is the default language for Microsoft Agent Framework. The SDK documentation, code samples, and tooling (AI Toolkit, agentdev CLI, Agent Inspector) are Python-first. The Foundry extension's agent creation flow defaults to Python.

### Why generate code (not a declarative config)?

Foundry agents are code-first, not config-first like CPS. The generated Python files are the source of truth. This is the fundamental shift: from YAML config pushed to a platform, to code deployed as a service.

### Why stub tools instead of auto-implementing?

Power Automate flows contain business logic in a low-code format that doesn't directly translate to Python. Generating correct stubs with the right interface (parameters, return types) is reliable. Generating the implementation would be unreliable and possibly incorrect. The developer (with Copilot's help) implements the logic.

### Why include evaluation from day one?

Evaluation is how you verify the migrated agent behaves the same as the CPS original. Without it, migration is a leap of faith. The scaffolding includes an empty eval dataset and runner so the developer can build test cases from CPS conversation transcripts.

## 6. Dependencies

| Dependency                      | Type                         | Extension ID / Notes                                                                         |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| AI Toolkit for VS Code          | Recommended                  | `ms-windows-ai-studio.windows-ai-studio` — agent creation, testing, debugging, model catalog |
| Microsoft Foundry extension     | Recommended                  | `teamsdevapp.vscode-ai-foundry` — project management, deployment, resource browsing          |
| Microsoft Agent Framework SDK   | Required (in generated code) | `agent-framework-azure-ai==1.0.0rc3`                                                         |
| Azure AI Foundry project        | Required (for deployment)    | Developer must have a Foundry project with a model deployment                                |
| Python 3.10+                    | Required (in generated code) | For running the generated Foundry project                                                    |
| Existing CPS agent in workspace | Required (for migration)     | Cloned via the CPS VS Code extension                                                         |

### Extension Role Mapping

The two Foundry extensions together provide the same capabilities as the CPS VS Code extension:

| CPS Extension (`microsoft-copilot-studio.*`) | AI Toolkit (`ai-mlstudio.*`) / Foundry (`azure-ai-foundry.*`)    |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `cloneAgent` — clone agent to local          | `createNewAgent` — create new agent project                      |
| `getChanges` — pull latest from CPS          | N/A — code is source of truth, use git                           |
| `previewChanges` — diff local vs remote      | `commandPalette.runAgent` — test locally                         |
| `applyChanges` — push to CPS environment     | `commandPalette.deployWorkflow` — deploy to Foundry              |
| `signIn` — authenticate to CPS               | `treeView.models.foundry.selectProject` — select Foundry project |
| N/A                                          | `openTestTool` — Agent Inspector for interactive debugging       |
| N/A                                          | `command.submitEvaluation` — submit batch evaluation             |
| N/A                                          | `triggerFoundryModelDeployment` — deploy model to Foundry        |

## 7. Risks and Mitigations

| Risk                                                | Impact                       | Mitigation                                                                                                       |
| --------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Agent Framework SDK breaking changes                | Generated code stops working | Pin versions. Document version in generated requirements.txt. Update pins when stable releases ship.             |
| Complex CPS topologies the parser can't handle      | Incomplete migration         | Start with hub-and-spoke (most common pattern). Flag unsupported structures with TODO markers.                   |
| Power Automate flows with complex logic             | Tool stubs insufficient      | Generate detailed stubs with parameter types + docstrings. Include the original flow description as comments.    |
| Knowledge source migration requires Azure AI Search | Cannot auto-provision        | Generate setup instructions. Offer to invoke Azure resource creation via Azure extension if available.           |
| Developer not familiar with Python                  | Code is opaque               | Generate thorough README. Add inline comments. Rely on Copilot (with Foundry knowledge injected) for assistance. |

## 8. Success Criteria

1. A developer with an existing CPS multi-agent solution can run `Migrate to Foundry` and get a buildable Foundry project
2. The generated `workflow.py` accurately reflects the CPS agent's multi-agent architecture
3. Agent instructions are migrated verbatim — no loss of prompt engineering
4. MCP tools are directly migrated and functional
5. Tool stubs have the correct interface matching the CPS action bindings
6. The project runs locally with `python main.py` after filling in `.env` values
7. The project is deployable as a Foundry hosted agent via the Foundry extension

## 9. Out of Scope (v1)

- Automatic Power Automate flow logic conversion to Python
- Automatic Azure AI Search provisioning and knowledge indexing
- Bidirectional sync (Foundry → CPS)
- CPS-to-Foundry runtime migration tool (this generates a new project, not an in-place migration)
- .NET code generation (Python only in v1)
- Automatic conversation transcript export from CPS for evaluation datasets
