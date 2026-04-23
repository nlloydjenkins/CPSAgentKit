// Knowledge surface — topic listing and document retrieval.
//
// The repository's knowledge lives under `docs/knowledge/` and
// `docs/bestpractices/` at the repo root. Consumers (VS Code extension,
// MCP server) pass in absolute directory paths so this module stays free
// of any path-resolution / bundling assumptions.

export { loadKnowledgeStore } from "./loader.js";
export type { KnowledgeStore, KnowledgeSource } from "./loader.js";
