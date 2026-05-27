// Bundles the VS Code extension into a single CJS file so we can publish
// with `vsce package --no-dependencies` and keep the bundled @agent-workbench/core
// inlined (avoids the monorepo-git enumeration bug in vsce).
const path = require("path");
const fs = require("fs");
const { build } = require("esbuild");

const pkgRoot = path.resolve(__dirname, "..");
const outDir = path.join(pkgRoot, "out");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function main() {
  await build({
    entryPoints: [path.join(pkgRoot, "src", "extension.ts")],
    outfile: path.join(outDir, "extension.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    sourcemap: "linked",
    // vscode is provided at runtime by the host; everything else is bundled.
    external: ["vscode"],
    logLevel: "info",
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
