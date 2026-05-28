<!-- AUTO-GENERATED for Agent Workbench repo maintenance. Regenerate after source knowledge changes. -->

# Agent Workbench for Copilot Studio — Product Development Assistant

You are helping maintain and evolve the Agent Workbench product in this repository. This workspace is the source code and documentation for the product, not a target Copilot Studio agent project.

Agent Workbench is a VS Code extension plus MCP server that helps makers build Copilot Studio agents. It writes project-level `.github/copilot-instructions.md` files into customer or demo workspaces during **Initialise Agent Workbench Project** and **Sync Knowledge**. Those generated project instructions turn GitHub Copilot into a Copilot Studio architect/builder/reviewer for that target workspace. Do not apply those project-agent workflow phases to this repository unless you are editing the template that will be emitted into projects.

## Product Boundary

- Treat `templates/copilot-instructions-template.md` as the **project-agent instruction template** that Agent Workbench writes into initialized/synced CPS workspaces.
- Treat this file, `templates/repo-copilot-instructions-template.md`, as the **repo-maintenance instruction template** for people developing Agent Workbench itself.
- Keep `.github/copilot-instructions.md` generated from `templates/repo-copilot-instructions-template.md` via `npm run generate:repo-instructions`.
- Do not let repo-level instructions tell Copilot to create `Requirements/spec.md`, build a CPS agent, or treat this repo as a customer solution.
- When product behavior changes, update source docs/templates first, then regenerate generated instructions and packaged assets.

## Source Of Truth

- Extension source: `packages/extension/src/`
- Core parsing/review logic: `packages/core/src/`
- MCP server tools: `packages/mcp-server/src/`
- Project-agent instruction template: `templates/copilot-instructions-template.md`
- Repo-maintenance instruction template: `templates/repo-copilot-instructions-template.md`
- CPS knowledge source docs: `docs/knowledge/`
- Best-practice source docs: `docs/bestpractices/`
- Use-case requirements: `docs/use-cases/`
- Workspace templates emitted to projects: `templates/`
- Generated repo instructions: `.github/copilot-instructions.md`

The generated `.github/copilot-instructions.md` should not be hand-edited. Edit the appropriate template or source knowledge file, then regenerate.

## Development Workflow

When changing product behavior:

1. Identify whether the change belongs in extension code, core/MCP logic, source docs, use cases, or generated project-agent prompts.
2. Keep source docs authoritative. If behavior lives in generated project instructions, edit `templates/copilot-instructions-template.md` or the relevant source docs used by project generation.
3. If the repo-level development guidance changes, edit `templates/repo-copilot-instructions-template.md` and run `npm run generate:repo-instructions`.
4. If shared docs/templates changed, run `npm run compile -w packages/extension` so packaged extension and MCP resources are refreshed.
5. Run `npm test` after meaningful changes.

Prefer focused product changes over broad rewrites. Preserve existing extension command IDs, generated file paths, and CPS-safe YAML rules unless the requested product change explicitly requires altering them.

## Product Principles

- Agent Workbench should help makers reach a complete working agent, not just produce advice.
- Build should perform safe backend/API actions when a supported path exists, such as Dataverse schema creation, sample data insertion, prompt instruction updates, and uploaded-file knowledge ingestion.
- Build must not fabricate portal/runtime-owned state. Connector bindings, prompt tool scaffolds, MCP discovery, and Power Automate flow internals require portal/API-backed creation or known-good exported patterns.
- Build checklists should be essential-only action lists. Do not generate long verification inventories; routine checks belong in troubleshooting or final notes unless they block a runnable agent.
- Use-case sample values such as email addresses, Teams channels, SharePoint libraries, service accounts, and Dataverse prefixes are build-time defaults to confirm or replace, not fixed tenant facts.
- Keep project-agent instructions clear that they operate in the target CPS workspace. Keep repo-level instructions clear that they operate on Agent Workbench itself.

## Common Product Areas

- Build Agent prompt behavior: `packages/extension/src/commands/buildAgent.ts`
- Prepare for Build runbook behavior: `packages/extension/src/commands/prepareForBuild.ts`
- Build Checklist command guidance: `packages/extension/src/commands/build.ts`
- Init and sync project instructions: `packages/extension/src/services/instructionsGenerator.ts`, `packages/extension/src/commands/init.ts`, and `packages/extension/src/commands/syncKnowledge.ts`
- Repo instruction generation: `scripts/generate-repo-instructions.js`
- Prompt config safety helpers: `packages/core/src/parsers/promptConfig.ts` and related MCP server tools
- CPS solution parsing/review: `packages/core/src/parsers/` and `packages/core/src/assessors/`

## Verification Commands

Use these commands from the repository root:

```sh
npm run generate:repo-instructions
npm run compile -w packages/extension
npm test
```

Run narrower checks when appropriate, but do not skip regeneration after editing generated-instruction templates.

## Release Metadata

Version files may be updated by `npm run build:patch`, `npm run build:minor`, or `npm run build:major`. Preserve user-generated version bumps unless explicitly asked to revert them.


---

## Available Knowledge Files

Read these files when you need detailed platform knowledge for design, build, or troubleshooting decisions:

- `docs/knowledge/anti-patterns.md`
- `docs/knowledge/cheat-sheet.md`
- `docs/knowledge/constraints.md`
- `docs/knowledge/dataverse-mcp-setup.md`
- `docs/knowledge/declarative-agents.md`
- `docs/knowledge/direct-line-api.md`
- `docs/knowledge/knowledge-sources.md`
- `docs/knowledge/multi-agent-patterns.md`
- `docs/knowledge/pipeline-patterns.md`
- `docs/knowledge/prompt-engineering.md`
- `docs/knowledge/prompt-sync.md`
- `docs/knowledge/reference-library.md`
- `docs/knowledge/reference-patterns.md`
- `docs/knowledge/retrieval-internals.md`
- `docs/knowledge/tool-descriptions.md`
- `docs/knowledge/troubleshooting.md`
- `docs/knowledge/yaml-syntax.md`

## Available Best Practice Files

Read these files when designing, building, or reviewing agents:

- `docs/bestpractices/part1-platform.md`
- `docs/bestpractices/part2-alm-governance-security.md`
- `docs/bestpractices/part3-agent-design.md`
- `docs/bestpractices/part4-tools-multiagent.md`
- `docs/bestpractices/part5-gotchas-bugs.md`

## Available Reference Architecture Templates

Read these directories for proven multi-agent designs and working examples when proposing architectures:

- `docs/templates/agent-test-harness/`
- `docs/templates/content-review-multi-agent/`
- `docs/templates/cpsagentkit-advisor-agent/`

---

## Current Project State

- **Current phase:** Extension development / knowledge authoring
- **Knowledge source mode:** Source docs under `docs/knowledge/`
- **Best practices source mode:** Source docs under `docs/bestpractices/`
- **Generated file purpose:** Repo-level Copilot context for maintaining Agent Workbench itself

**Next step:** Keep source docs authoritative. Regenerate this file after knowledge or best-practice updates so Copilot sees the latest reference library.
