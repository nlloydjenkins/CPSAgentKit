#!/usr/bin/env node
// Copies shared repo-root assets (templates/, docs/) into packages that need them
// at build/package time. Runs as a prepackage / prebuild step.
//
// Targets:
//   - packages/extension/templates/           ← templates/
//   - packages/mcp-server/resources/docs/     ← docs/knowledge/ + docs/bestpractices/
//   - packages/mcp-server/resources/templates/ ← templates/

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

function rmDir(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-shared-assets] source missing: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

const targets = [
  {
    label: "extension templates",
    src: path.join(repoRoot, "templates"),
    dest: path.join(repoRoot, "packages", "extension", "templates"),
  },
  {
    label: "extension knowledge docs",
    src: path.join(repoRoot, "docs", "knowledge"),
    dest: path.join(repoRoot, "packages", "extension", "docs", "knowledge"),
  },
  {
    label: "extension best practices",
    src: path.join(repoRoot, "docs", "bestpractices"),
    dest: path.join(repoRoot, "packages", "extension", "docs", "bestpractices"),
  },
  {
    label: "mcp-server knowledge docs",
    src: path.join(repoRoot, "docs", "knowledge"),
    dest: path.join(
      repoRoot,
      "packages",
      "mcp-server",
      "resources",
      "docs",
      "knowledge",
    ),
  },
  {
    label: "mcp-server best practices",
    src: path.join(repoRoot, "docs", "bestpractices"),
    dest: path.join(
      repoRoot,
      "packages",
      "mcp-server",
      "resources",
      "docs",
      "bestpractices",
    ),
  },
  {
    label: "mcp-server templates",
    src: path.join(repoRoot, "templates"),
    dest: path.join(repoRoot, "packages", "mcp-server", "resources", "templates"),
  },
];

for (const { label, src, dest } of targets) {
  rmDir(dest);
  copyDir(src, dest);
  console.log(`[copy-shared-assets] ${label}: ${path.relative(repoRoot, dest)}`);
}

// Single-file copies (e.g. LICENSE for vsce packaging).
const fileCopies = [
  {
    label: "extension LICENSE",
    src: path.join(repoRoot, "LICENSE"),
    dest: path.join(repoRoot, "packages", "extension", "LICENSE"),
  },
];

for (const { label, src, dest } of fileCopies) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-shared-assets] source missing: ${src}`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[copy-shared-assets] ${label}: ${path.relative(repoRoot, dest)}`);
}
