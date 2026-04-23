// @cpsagentkit/core — shared logic for the CPSAgentKit VS Code extension and MCP server.
// Subpath exports: ./types, ./knowledge, ./fs, ./parsers, ./assessors, ./version.

export * from "./types/index.js";
export * from "./knowledge/index.js";

// File-system utilities
export * from "./fs/fileUtils.js";

// Parsers
export * from "./parsers/projectState.js";
export * from "./parsers/solutionFileParser.js";
export * from "./parsers/agentSnapshot.js";
export * from "./parsers/markdown.js";

// Assessors
export * from "./assessors/connectorCatalog.js";
export * from "./assessors/architectureTools.js";
export * from "./assessors/reviewPrompt.js";
export * from "./assessors/toolDescription.js";
export * from "./assessors/preBuildGenerator.js";

export { CORE_VERSION } from "./version.js";
