#!/usr/bin/env node
// Cross-platform build-release script
// Usage: node scripts/build-release.js patch|minor|major

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BUMP_TYPE = process.argv[2];
if (!["patch", "minor", "major"].includes(BUMP_TYPE)) {
  console.error("Usage: node scripts/build-release.js patch|minor|major");
  process.exit(1);
}

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

// Bump version in package.json (no git tag)
run(`npm version ${BUMP_TYPE} --no-git-tag-version`);

// Read the new version
const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
const VERSION = pkg.version;
console.log(`Version bumped to ${VERSION}`);

// Update CURRENT_VERSION in config.ts
const configPath = path.join("src", "services", "config.ts");
let configContent = fs.readFileSync(configPath, "utf-8");
configContent = configContent.replace(
  /const CURRENT_VERSION = ".*"/,
  `const CURRENT_VERSION = "${VERSION}"`
);
fs.writeFileSync(configPath, configContent, "utf-8");

// Compile
run("npm run compile");

// Package into releases/
const releasesDir = "releases";
if (!fs.existsSync(releasesDir)) {
  fs.mkdirSync(releasesDir, { recursive: true });
}
run(`npx vsce package -o "${path.join(releasesDir, `cpsagentkit-${VERSION}.vsix`)}"`);

const vsixPath = path.join(releasesDir, `cpsagentkit-${VERSION}.vsix`);
const absVsixPath = path.resolve(vsixPath);

console.log("");
console.log(`Done: cpsagentkit-${VERSION} packaged`);
console.log(`VSIX: ${absVsixPath}`);
console.log("");
console.log("To install, run:");
console.log(`  code --install-extension "${absVsixPath}" --force`);
console.log("Then reload the VS Code window (Ctrl+Shift+P → Developer: Reload Window).");
