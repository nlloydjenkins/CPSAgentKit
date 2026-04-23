#!/usr/bin/env node
// Cross-platform build-release script (monorepo-aware)
// Usage: node scripts/build-release.js patch|minor|major
//
// Bumps version on the root package and all workspace packages in lockstep
// (unified versioning), updates CURRENT_VERSION in the extension's config
// and CORE_VERSION in the shared core package, compiles all packages, and
// packages the VS Code extension vsix.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BUMP_TYPE = process.argv[2];
if (!["patch", "minor", "major"].includes(BUMP_TYPE)) {
  console.error("Usage: node scripts/build-release.js patch|minor|major");
  process.exit(1);
}

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

const repoRoot = path.resolve(__dirname, "..");

// Bump version on the root package (no git tag)
run(`npm version ${BUMP_TYPE} --no-git-tag-version`);

// Read the new version
const rootPkg = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"),
);
const VERSION = rootPkg.version;
console.log(`Version bumped to ${VERSION}`);

// Propagate version to all workspace packages and the mcp-server's core dep
const workspacePackages = [
  path.join(repoRoot, "packages", "core", "package.json"),
  path.join(repoRoot, "packages", "extension", "package.json"),
  path.join(repoRoot, "packages", "mcp-server", "package.json"),
];
for (const pkgPath of workspacePackages) {
  if (!fs.existsSync(pkgPath)) {
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.version = VERSION;
  if (pkg.dependencies && pkg.dependencies["@cpsagentkit/core"]) {
    pkg.dependencies["@cpsagentkit/core"] = VERSION;
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log(`  updated ${path.relative(repoRoot, pkgPath)}`);
}

// Update CURRENT_VERSION in the extension's config.ts
const configPath = path.join(
  repoRoot,
  "packages",
  "extension",
  "src",
  "services",
  "config.ts",
);
let configContent = fs.readFileSync(configPath, "utf-8");
configContent = configContent.replace(
  /const CURRENT_VERSION = ".*"/,
  `const CURRENT_VERSION = "${VERSION}"`,
);
configContent = configContent.replace(
  /export const CURRENT_VERSION = ".*"/,
  `export const CURRENT_VERSION = "${VERSION}"`,
);
fs.writeFileSync(configPath, configContent, "utf-8");
console.log("  updated packages/extension/src/services/config.ts");

// Update CORE_VERSION in the core package's version.ts
const coreVersionPath = path.join(
  repoRoot,
  "packages",
  "core",
  "src",
  "version.ts",
);
let coreVersionContent = fs.readFileSync(coreVersionPath, "utf-8");
coreVersionContent = coreVersionContent.replace(
  /export const CORE_VERSION = ".*"/,
  `export const CORE_VERSION = "${VERSION}"`,
);
fs.writeFileSync(coreVersionPath, coreVersionContent, "utf-8");
console.log("  updated packages/core/src/version.ts");

// Update MCP_SERVER_VERSION in the mcp-server's index.ts
const mcpIndexPath = path.join(
  repoRoot,
  "packages",
  "mcp-server",
  "src",
  "index.ts",
);
if (fs.existsSync(mcpIndexPath)) {
  let mcpIndexContent = fs.readFileSync(mcpIndexPath, "utf-8");
  mcpIndexContent = mcpIndexContent.replace(
    /export const MCP_SERVER_VERSION = ".*"/,
    `export const MCP_SERVER_VERSION = "${VERSION}"`,
  );
  fs.writeFileSync(mcpIndexPath, mcpIndexContent, "utf-8");
  console.log("  updated packages/mcp-server/src/index.ts");
}

// Compile all workspaces
run("npm run compile");

// Package the extension vsix into releases/
const releasesDir = path.join(repoRoot, "releases");
if (!fs.existsSync(releasesDir)) {
  fs.mkdirSync(releasesDir, { recursive: true });
}
const vsixPath = path.join(releasesDir, `cpsagentkit-${VERSION}.vsix`);
run(`npx vsce package --no-dependencies -o "${vsixPath}"`, {
  cwd: path.join(repoRoot, "packages", "extension"),
});

const absVsixPath = path.resolve(vsixPath);
console.log("");
console.log(`Done: cpsagentkit-${VERSION} packaged`);
console.log(`VSIX: ${absVsixPath}`);
console.log("");
console.log("To install, run:");
console.log(`  code --install-extension "${absVsixPath}" --force`);
console.log(
  "Then reload the VS Code window (Ctrl+Shift+P → Developer: Reload Window).",
);
