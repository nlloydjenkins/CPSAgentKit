#!/usr/bin/env node
// Build a self-contained bundle of the MCP server for npm publishing.
// Emits:
//   dist/bin.js     — CLI entry point (cpsagentkit-mcp)
//   dist/index.js   — library entry point
// External deps (not bundled): @modelcontextprotocol/sdk, zod.
// Internal @cpsagentkit/core is bundled in.

const { build } = require("esbuild");
const path = require("path");
const fs = require("fs");

const pkgRoot = path.resolve(__dirname, "..");
const outDir = path.join(pkgRoot, "dist");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const externals = [
  "@modelcontextprotocol/sdk",
  "@modelcontextprotocol/sdk/*",
  "zod",
];

async function main() {
  await build({
    entryPoints: [path.join(pkgRoot, "src", "bin.ts")],
    outfile: path.join(outDir, "bin.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    sourcemap: "linked",
    external: externals,
    logLevel: "info",
  });

  await build({
    entryPoints: [path.join(pkgRoot, "src", "index.ts")],
    outfile: path.join(outDir, "index.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    sourcemap: "linked",
    external: externals,
    logLevel: "info",
  });

  // Make the bin file executable on POSIX.
  try {
    fs.chmodSync(path.join(outDir, "bin.js"), 0o755);
  } catch {
    /* ignore on Windows */
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
