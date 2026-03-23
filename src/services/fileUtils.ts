import * as fs from "fs/promises";
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
  const files: FileEntry[] = [];
  try {
    const entries = await fs.readdir(dir);
    const filtered = entries.filter((f) => f.endsWith(extension)).sort();
    for (const filename of filtered) {
      const content = await fs.readFile(path.join(dir, filename), "utf-8");
      files.push({ filename, content });
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return files;
}

/** Shorthand: read all .md files from a directory */
export function readMarkdownFiles(dir: string): Promise<FileEntry[]> {
  return readFilesByExtension(dir, ".md");
}

/** Shorthand: read all .yaml / .yml files from a directory */
export async function readYamlFiles(dir: string): Promise<FileEntry[]> {
  const files: FileEntry[] = [];
  try {
    const entries = await fs.readdir(dir);
    const yamls = entries
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .sort();
    for (const filename of yamls) {
      const content = await fs.readFile(path.join(dir, filename), "utf-8");
      files.push({ filename, content });
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return files;
}

/**
 * Detect CPS agent folders in the workspace — directories containing
 * a settings file (settings.yaml or settings.mcs.yml) and a topics/ subdirectory.
 */
export async function findCpsAgentFolders(
  workspaceRoot: string,
): Promise<string[]> {
  const agents: string[] = [];
  try {
    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }
      const dir = path.join(workspaceRoot, entry.name);
      const hasSettings =
        (await fileExists(path.join(dir, "settings.yaml"))) ||
        (await fileExists(path.join(dir, "settings.mcs.yml")));
      const hasTopics = await fileExists(path.join(dir, "topics"));
      if (hasSettings && hasTopics) {
        agents.push(entry.name);
      }
    }
  } catch {
    // Workspace listing failed — return empty
  }
  return agents;
}
