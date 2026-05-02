import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  fileExists,
  readFilesByExtension,
  readYamlFiles,
  findCpsAgentFolders,
  findImageFiles,
} from "../../fs/fileUtils.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cps-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── fileExists ───────────────────────────────────────────────

describe("fileExists", () => {
  it("returns true for an existing file", async () => {
    const fp = path.join(tmpDir, "exists.txt");
    await fs.writeFile(fp, "hello");
    expect(await fileExists(fp)).toBe(true);
  });

  it("returns false for a non-existent file", async () => {
    expect(await fileExists(path.join(tmpDir, "nope.txt"))).toBe(false);
  });

  it("returns true for an existing directory", async () => {
    const dir = path.join(tmpDir, "subdir");
    await fs.mkdir(dir);
    expect(await fileExists(dir)).toBe(true);
  });
});

// ── readFilesByExtension ─────────────────────────────────────

describe("readFilesByExtension", () => {
  it("reads files with the given extension, sorted", async () => {
    await fs.writeFile(path.join(tmpDir, "b.md"), "content-b");
    await fs.writeFile(path.join(tmpDir, "a.md"), "content-a");
    await fs.writeFile(path.join(tmpDir, "c.txt"), "ignored");

    const results = await readFilesByExtension(tmpDir, ".md");
    expect(results).toHaveLength(2);
    expect(results[0].filename).toBe("a.md");
    expect(results[0].content).toBe("content-a");
    expect(results[1].filename).toBe("b.md");
  });

  it("returns empty array for non-existent directory", async () => {
    const results = await readFilesByExtension("/does/not/exist", ".md");
    expect(results).toEqual([]);
  });

  it("returns empty array when no files match", async () => {
    await fs.writeFile(path.join(tmpDir, "file.txt"), "hello");
    const results = await readFilesByExtension(tmpDir, ".yaml");
    expect(results).toEqual([]);
  });
});

// ── readYamlFiles ────────────────────────────────────────────

describe("readYamlFiles", () => {
  it("reads both .yaml and .yml files", async () => {
    await fs.writeFile(path.join(tmpDir, "a.yaml"), "key: 1");
    await fs.writeFile(path.join(tmpDir, "b.yml"), "key: 2");
    await fs.writeFile(path.join(tmpDir, "c.json"), "ignored");

    const results = await readYamlFiles(tmpDir);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.filename)).toEqual(["a.yaml", "b.yml"]);
  });

  it("returns empty array for non-existent directory", async () => {
    expect(await readYamlFiles("/does/not/exist")).toEqual([]);
  });
});

// ── findCpsAgentFolders ──────────────────────────────────────

describe("findCpsAgentFolders", () => {
  it("finds a folder with settings.yaml and topics/", async () => {
    const agentDir = path.join(tmpDir, "MyAgent");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: test");
    await fs.mkdir(path.join(agentDir, "topics"));

    const result = await findCpsAgentFolders(tmpDir);
    expect(result).toEqual(["MyAgent"]);
  });

  it("finds a folder with settings.mcs.yml and topics/", async () => {
    const agentDir = path.join(tmpDir, "Agent2");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.mcs.yml"), "name: test");
    await fs.mkdir(path.join(agentDir, "topics"));

    const result = await findCpsAgentFolders(tmpDir);
    expect(result).toEqual(["Agent2"]);
  });

  it("returns empty when no agent folders exist", async () => {
    await fs.mkdir(path.join(tmpDir, "regular-folder"));
    const result = await findCpsAgentFolders(tmpDir);
    expect(result).toEqual([]);
  });

  it("skips directories in AGENT_SCAN_SKIP_DIRS", async () => {
    const nodeModules = path.join(tmpDir, "node_modules", "agent");
    await fs.mkdir(nodeModules, { recursive: true });
    await fs.writeFile(path.join(nodeModules, "settings.yaml"), "name: hidden");
    await fs.mkdir(path.join(nodeModules, "topics"));

    const result = await findCpsAgentFolders(tmpDir);
    expect(result).toEqual([]);
  });

  it("skips dot directories", async () => {
    const dotDir = path.join(tmpDir, ".hidden");
    await fs.mkdir(dotDir);
    await fs.writeFile(path.join(dotDir, "settings.yaml"), "name: x");
    await fs.mkdir(path.join(dotDir, "topics"));

    const result = await findCpsAgentFolders(tmpDir);
    expect(result).toEqual([]);
  });

  it("returns sorted results", async () => {
    for (const name of ["Zeta", "Alpha", "Mid"]) {
      const dir = path.join(tmpDir, name);
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, "settings.yaml"), "name: " + name);
      await fs.mkdir(path.join(dir, "topics"));
    }

    const result = await findCpsAgentFolders(tmpDir);
    expect(result).toEqual(["Alpha", "Mid", "Zeta"]);
  });

  it("does not recurse into agent folders", async () => {
    // Create an agent with a nested "agent" — the inner one should not be found
    const outer = path.join(tmpDir, "Outer");
    await fs.mkdir(outer);
    await fs.writeFile(path.join(outer, "settings.yaml"), "name: Outer");
    await fs.mkdir(path.join(outer, "topics"));

    const inner = path.join(outer, "Inner");
    await fs.mkdir(inner);
    await fs.writeFile(path.join(inner, "settings.yaml"), "name: Inner");
    await fs.mkdir(path.join(inner, "topics"));

    const result = await findCpsAgentFolders(tmpDir);
    expect(result).toEqual(["Outer"]);
  });

  it("handles unreadable directories gracefully", async () => {
    const result = await findCpsAgentFolders(
      path.join(tmpDir, "nonexistent-path"),
    );
    expect(result).toEqual([]);
  });

  it("returns '.' when the workspace root itself is an agent folder", async () => {
    await fs.writeFile(path.join(tmpDir, "settings.yaml"), "name: Root");
    await fs.mkdir(path.join(tmpDir, "topics"));
    const result = await findCpsAgentFolders(tmpDir);
    expect(result).toEqual(["."]);
  });

  it("skips node_modules and dot directories", async () => {
    // Agent in node_modules should be skipped
    const nmDir = path.join(tmpDir, "node_modules", "pkg");
    await fs.mkdir(nmDir, { recursive: true });
    await fs.writeFile(path.join(nmDir, "settings.yaml"), "name: Hidden");
    await fs.mkdir(path.join(nmDir, "topics"));

    // Agent in .hidden should be skipped
    const dotDir = path.join(tmpDir, ".hidden");
    await fs.mkdir(dotDir, { recursive: true });
    await fs.writeFile(path.join(dotDir, "settings.yaml"), "name: Dot");
    await fs.mkdir(path.join(dotDir, "topics"));

    // Legit agent in a normal folder
    const goodDir = path.join(tmpDir, "MyAgent");
    await fs.mkdir(goodDir);
    await fs.writeFile(path.join(goodDir, "settings.yaml"), "name: Good");
    await fs.mkdir(path.join(goodDir, "topics"));

    const result = await findCpsAgentFolders(tmpDir);
    expect(result).toEqual(["MyAgent"]);
  });
});

// ── findImageFiles ───────────────────────────────────────────

describe("findImageFiles", () => {
  it("finds image files by extension", async () => {
    await fs.writeFile(path.join(tmpDir, "photo.png"), "");
    await fs.writeFile(path.join(tmpDir, "icon.svg"), "");
    await fs.writeFile(path.join(tmpDir, "doc.txt"), "");
    await fs.writeFile(path.join(tmpDir, "pic.jpg"), "");

    const result = await findImageFiles(tmpDir);
    expect(result).toEqual(["icon.svg", "photo.png", "pic.jpg"]);
  });

  it("returns empty for non-existent directory", async () => {
    expect(await findImageFiles("/does/not/exist")).toEqual([]);
  });

  it("returns empty when no images present", async () => {
    await fs.writeFile(path.join(tmpDir, "readme.md"), "");
    expect(await findImageFiles(tmpDir)).toEqual([]);
  });
});
