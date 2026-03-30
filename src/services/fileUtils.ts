import * as fs from "fs/promises";
import type { Dirent } from "fs";
import * as path from "path";

/** Check if a path exists on disk */
export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const AGENT_SCAN_SKIP_DIRS = new Set([
  ".git",
  ".github",
  ".vscode",
  ".claude",
  "node_modules",
  "out",
  "dist",
  "build",
  "releases",
  "Pre-Build",
  "change-requests",
  "docs",
  "templates",
  "scripts",
  "src",
  "test",
  "tests",
]);

function shouldSkipAgentScanDir(name: string): boolean {
  return name.startsWith(".") || AGENT_SCAN_SKIP_DIRS.has(name);
}

/**
 * Resolve a file path within a base directory, rejecting path traversal attempts.
 * Throws if the resolved path escapes the base directory.
 */
export function safePath(baseDir: string, relativePath: string): string {
  const resolved = path.resolve(baseDir, relativePath);
  const normalizedBase = path.resolve(baseDir);
  if (
    resolved !== normalizedBase &&
    !resolved.startsWith(normalizedBase + path.sep)
  ) {
    throw new Error(`Path traversal blocked: ${relativePath}`);
  }
  return resolved;
}

/** A file's name and content */
export interface FileEntry {
  filename: string;
  content: string;
}

/**
 * Read all files with a given extension from a directory, sorted alphabetically.
 * Returns empty array if the directory doesn't exist.
 */
export async function readFilesByExtension(
  dir: string,
  extension: string,
): Promise<FileEntry[]> {
  try {
    const entries = await fs.readdir(dir);
    const filtered = entries.filter((f) => f.endsWith(extension)).sort();
    const results = await Promise.all(
      filtered.map(async (filename) => ({
        filename,
        content: await fs.readFile(path.join(dir, filename), "utf-8"),
      })),
    );
    return results;
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }
}

/** Shorthand: read all .md files from a directory */
export function readMarkdownFiles(dir: string): Promise<FileEntry[]> {
  return readFilesByExtension(dir, ".md");
}

/** Shorthand: read all .yaml / .yml files from a directory */
export async function readYamlFiles(dir: string): Promise<FileEntry[]> {
  try {
    const entries = await fs.readdir(dir);
    const yamls = entries
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .sort();
    const results = await Promise.all(
      yamls.map(async (filename) => ({
        filename,
        content: await fs.readFile(path.join(dir, filename), "utf-8"),
      })),
    );
    return results;
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }
}

/**
 * Detect CPS agent folders anywhere in the workspace.
 *
 * A CPS agent root is a directory containing a settings file
 * (settings.yaml or settings.mcs.yml) and a topics/ subdirectory.
 *
 * Returns workspace-relative paths. Once a CPS agent root is found, the scan
 * stops descending into that subtree so internal CPS folders are not re-scanned.
 */
export async function findCpsAgentFolders(
  workspaceRoot: string,
): Promise<string[]> {
  const agents: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const hasSettings =
      (await fileExists(path.join(dir, "settings.yaml"))) ||
      (await fileExists(path.join(dir, "settings.mcs.yml")));
    const hasTopics = await fileExists(path.join(dir, "topics"));
    if (hasSettings && hasTopics) {
      const relative = path.relative(workspaceRoot, dir) || ".";
      agents.push(relative);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (shouldSkipAgentScanDir(entry.name)) {
        continue;
      }
      await walk(path.join(dir, entry.name));
    }
  }

  await walk(workspaceRoot);
  return agents.sort((a, b) => a.localeCompare(b));
}

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
]);

/**
 * Find image files in a directory (non-recursive).
 * Returns filenames only, sorted alphabetically.
 */
export async function findImageFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .sort();
  } catch {
    return [];
  }
}
