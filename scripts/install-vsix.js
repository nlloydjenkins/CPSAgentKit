#!/usr/bin/env node
// Install the latest built VSIX into the current VS Code instance.
// Usage: node scripts/install-vsix.js

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const releasesDir = "releases";
if (!fs.existsSync(releasesDir)) {
  console.error("No releases/ directory found. Run a build first (npm run build:patch).");
  process.exit(1);
}

// Find the latest .vsix file by modified time
const vsixFiles = fs.readdirSync(releasesDir)
  .filter(f => f.endsWith(".vsix"))
  .map(f => ({
    name: f,
    path: path.join(releasesDir, f),
    mtime: fs.statSync(path.join(releasesDir, f)).mtimeMs,
  }))
  .sort((a, b) => b.mtime - a.mtime);

if (vsixFiles.length === 0) {
  console.error("No .vsix files found in releases/. Run a build first (npm run build:patch).");
  process.exit(1);
}

const latest = vsixFiles[0];
const absPath = path.resolve(latest.path);

console.log(`Installing ${latest.name}...`);
execSync(`code --install-extension "${absPath}" --force`, { stdio: "inherit" });
console.log("");
console.log("Installed. Reload the VS Code window to activate:");
console.log("  Ctrl+Shift+P → Developer: Reload Window");
