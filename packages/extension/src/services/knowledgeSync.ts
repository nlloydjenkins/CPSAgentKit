import * as fs from "fs/promises";
import * as path from "path";
import * as https from "https";
import { CpsConfig } from "./config.js";
import { safePath } from "./fileUtils.js";

const KNOWLEDGE_DIR = path.join(".agent-workbench", "knowledge");
const TEMPLATES_DIR = path.join(".agent-workbench", "templates");
const BEST_PRACTICES_DIR = path.join(".agent-workbench", "bestpractices");

/** Result of a knowledge sync operation */
export interface SyncResult {
  filesWritten: string[];
  errors: string[];
}

/** A file entry from the GitHub Contents API */
interface GitHubContentEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

/**
 * Parse a GitHub repo URL into owner and repo name.
 * Accepts: https://github.com/owner/repo or https://github.com/owner/repo.git
 * Rejects non-GitHub URLs to prevent SSRF.
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const match = url.match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
  );
  if (!match) {
    throw new Error(
      `Invalid GitHub repo URL: ${url}. Expected format: https://github.com/owner/repo`,
    );
  }
  return { owner: match[1], repo: match[2] };
}

/** HTTPS GET returning a string — minimal wrapper, no external deps */
function httpsGet(url: string, remainingRedirects = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    // Only allow api.github.com and raw.githubusercontent.com to prevent SSRF
    const allowedHosts = ["api.github.com", "raw.githubusercontent.com"];
    if (!allowedHosts.includes(parsed.hostname)) {
      reject(
        new Error(`Blocked request to disallowed host: ${parsed.hostname}`),
      );
      return;
    }

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { "User-Agent": "cpsagentkit-vscode" },
    };

    https
      .get(options, (res) => {
        // Follow redirects with a depth limit (GitHub sometimes redirects)
        if (res.statusCode === 301 || res.statusCode === 302) {
          if (remainingRedirects <= 0) {
            reject(new Error("Too many redirects"));
            return;
          }
          const location = res.headers.location;
          if (!location) {
            reject(new Error("Redirect with no location header"));
            return;
          }
          const redirectUrl = new URL(location);
          if (!allowedHosts.includes(redirectUrl.hostname)) {
            reject(
              new Error(
                `Blocked redirect to disallowed host: ${redirectUrl.hostname}`,
              ),
            );
            return;
          }
          httpsGet(location, remainingRedirects - 1).then(resolve, reject);
          return;
        }

        if (res.statusCode === 403) {
          reject(
            new Error(
              "GitHub API rate limit exceeded. Try again later or configure an access token.",
            ),
          );
          return;
        }
        if (res.statusCode === 404) {
          reject(
            new Error(
              "Knowledge repo or path not found. Check agentWorkbench.knowledgeRepoUrl and the knowledge path in config.json.",
            ),
          );
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API returned HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

/**
 * List markdown files in a GitHub repo directory via the Contents API.
 * Returns download URLs for each .md file.
 */
async function listKnowledgeFiles(
  owner: string,
  repo: string,
  knowledgePath: string,
  branch: string,
): Promise<GitHubContentEntry[]> {
  // Encode each path segment individually — encoding the whole path turns / into %2F
  const encodedPath = knowledgePath
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const raw = await httpsGet(apiUrl);
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected GitHub API response: expected array");
  }
  const entries = parsed as GitHubContentEntry[];
  // Only return markdown files
  return entries.filter((e) => e.type === "file" && e.name.endsWith(".md"));
}

/**
 * Recursively list all markdown files in a GitHub repo directory.
 * Returns entries with their relative paths from the root directory.
 */
async function listFilesRecursive(
  owner: string,
  repo: string,
  dirPath: string,
  branch: string,
): Promise<GitHubContentEntry[]> {
  const encodedPath = dirPath.split("/").map(encodeURIComponent).join("/");
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const raw = await httpsGet(apiUrl);
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected GitHub API response: expected array");
  }
  const entries = parsed as GitHubContentEntry[];

  const results: GitHubContentEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "file" && entry.name.endsWith(".md")) {
      results.push(entry);
    } else if (entry.type === "dir") {
      const children = await listFilesRecursive(
        owner,
        repo,
        entry.path,
        branch,
      );
      results.push(...children);
    }
  }
  return results;
}

/** Download a single file's content from its raw URL */
async function downloadFile(downloadUrl: string): Promise<string> {
  return httpsGet(downloadUrl);
}

/**
 * Recursively copy all .md files from a bundled source directory to a destination.
 * Used as a fallback when GitHub sync is unavailable.
 */
async function copyBundledFiles(
  srcDir: string,
  destDir: string,
  baseSrcDir?: string,
): Promise<string[]> {
  const base = baseSrcDir ?? srcDir;
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(srcDir, { withFileTypes: true });
  } catch {
    return []; // Source dir doesn't exist in the bundle
  }

  const copied: string[] = [];
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      const children = await copyBundledFiles(srcPath, destDir, base);
      copied.push(...children);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const relativePath = path.relative(base, srcPath);
      const destPath = safePath(destDir, relativePath);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
      copied.push(relativePath);
    }
  }
  return copied;
}

/** Configuration for a single sync category */
interface SyncCategoryConfig {
  /** Workspace-relative target directory (e.g. ".agent-workbench/knowledge") */
  targetDir: string;
  /** GitHub repo path to sync from (e.g. "docs/knowledge") */
  repoPath: string;
  /** Bundled subdirectory name under extensionPath/docs/ (e.g. "knowledge") */
  bundledSubdir: string;
  /** Label used in progress messages (e.g. "knowledge") */
  label: string;
  /** If true, 0 remote files is not an error (silently returns) */
  emptyOk?: boolean;
}

/**
 * Generic category sync: download .md files from GitHub (with bundled fallback).
 */
async function syncCategory(
  workspaceRoot: string,
  config: CpsConfig,
  category: SyncCategoryConfig,
  onProgress?: (message: string) => void,
  extensionPath?: string,
): Promise<SyncResult> {
  const result: SyncResult = { filesWritten: [], errors: [] };
  const destDir = path.join(workspaceRoot, category.targetDir);

  await fs.mkdir(destDir, { recursive: true });

  const { owner, repo } = parseGitHubUrl(config.knowledgeRepoUrl);
  const branch = config.knowledgeRepoBranch || "main";

  onProgress?.(`Fetching ${category.label} file list from GitHub...`);

  let files: GitHubContentEntry[];
  try {
    files = await listFilesRecursive(owner, repo, category.repoPath, branch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (extensionPath) {
      onProgress?.(
        `GitHub unavailable — copying bundled ${category.label} files...`,
      );
      const bundledDir = path.join(
        extensionPath,
        "docs",
        category.bundledSubdir,
      );
      const copied = await copyBundledFiles(bundledDir, destDir);
      result.filesWritten.push(...copied);
      if (copied.length > 0) {
        return result;
      }
    }
    result.errors.push(`Failed to list ${category.label} files: ${message}`);
    return result;
  }

  if (files.length === 0) {
    if (!category.emptyOk) {
      result.errors.push(
        `No markdown files found in the ${category.label} directory.`,
      );
    }
    return result;
  }

  for (const file of files) {
    try {
      onProgress?.(`Downloading ${file.name}...`);
      if (!file.download_url) {
        result.errors.push(`No download URL for ${file.name}`);
        continue;
      }
      const content = await downloadFile(file.download_url);
      const relativePath = file.path.startsWith(category.repoPath + "/")
        ? file.path.slice(category.repoPath.length + 1)
        : file.name;
      const destPath = safePath(destDir, relativePath);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, content, "utf-8");
      result.filesWritten.push(relativePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Failed to download ${file.name}: ${message}`);
    }
  }

  return result;
}

/**
 * Sync knowledge files from the configured GitHub repo into the local workspace.
 * Overwrites existing knowledge files. Reports progress via callback.
 */
export async function syncKnowledge(
  workspaceRoot: string,
  config: CpsConfig,
  onProgress?: (message: string) => void,
  extensionPath?: string,
): Promise<SyncResult> {
  return syncCategory(
    workspaceRoot,
    config,
    {
      targetDir: KNOWLEDGE_DIR,
      repoPath: config.knowledgePath || "docs/knowledge",
      bundledSubdir: "knowledge",
      label: "knowledge",
    },
    onProgress,
    extensionPath,
  );
}

/**
 * Sync template files from the configured GitHub repo into the local workspace.
 * Templates are stored in .agent-workbench/templates/ preserving directory structure.
 */
export async function syncTemplates(
  workspaceRoot: string,
  config: CpsConfig,
  onProgress?: (message: string) => void,
  extensionPath?: string,
): Promise<SyncResult> {
  return syncCategory(
    workspaceRoot,
    config,
    {
      targetDir: TEMPLATES_DIR,
      repoPath: config.templatesPath || "docs/templates",
      bundledSubdir: "templates",
      label: "template",
    },
    onProgress,
    extensionPath,
  );
}

/**
 * Sync best practice files from the configured GitHub repo into docs/bestpractices/.
 * These are user-facing best practice documents used by the Run Agent Assessment feature.
 */
export async function syncBestPractices(
  workspaceRoot: string,
  config: CpsConfig,
  onProgress?: (message: string) => void,
  extensionPath?: string,
): Promise<SyncResult> {
  return syncCategory(
    workspaceRoot,
    config,
    {
      targetDir: BEST_PRACTICES_DIR,
      repoPath: config.bestPracticesPath || "docs/bestpractices",
      bundledSubdir: "bestpractices",
      label: "best practice",
      emptyOk: true,
    },
    onProgress,
    extensionPath,
  );
}
