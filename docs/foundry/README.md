# Microsoft Foundry Knowledge Base

Best practices, constraints, and patterns for building agents and workflows on Microsoft Foundry using the Microsoft Agent Framework SDK.

This knowledge base is the Foundry counterpart to the CPS knowledge in `docs/knowledge/`. It is used by the **Migrate to Foundry** feature to guide code generation and by `copilot-instructions.md` to make GitHub Copilot aware of Foundry patterns.

## Contents

| File                                                   | Purpose                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| [agent-framework.md](agent-framework.md)               | SDK overview, version pins, client patterns, streaming, sessions   |
| [multi-agent-workflows.md](multi-agent-workflows.md)   | WorkflowBuilder, Executor pattern, multi-agent orchestration       |
| [tools-and-mcp.md](tools-and-mcp.md)                   | Function tools, MCP stdio/HTTP, tool registration                  |
| [deployment.md](deployment.md)                         | HTTP server pattern, containerisation, Foundry hosted agents       |
| [evaluation.md](evaluation.md)                         | Built-in evaluators, custom evaluators, dataset management         |
| [cps-to-foundry-mapping.md](cps-to-foundry-mapping.md) | Concept mapping from CPS to Foundry — the migration rosetta stone  |
| [constraints.md](constraints.md)                       | Foundry platform limits, SDK gotchas, known issues                 |
| [ai-toolkit-extension.md](ai-toolkit-extension.md)     | AI Toolkit VS Code extension — commands, tools, integration points |
