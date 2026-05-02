import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { loadKnowledgeStore } from "../../knowledge/loader.js";
import type { KnowledgeCategory } from "../../types/index.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cps-loader-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function createKnowledgeDir(
  category: string,
  files: Record<string, string>,
): Promise<string> {
  const dir = path.join(tmpDir, category);
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content);
  }
  return dir;
}

describe("loadKnowledgeStore", () => {
  it("loads markdown files from a single source", async () => {
    const dir = await createKnowledgeDir("knowledge", {
      "constraints.md": "# Constraints\n\nMax 25 tools.",
      "patterns.md": "# Multi-Agent Patterns\n\nParent-child routing.",
    });

    const store = await loadKnowledgeStore([
      { category: "knowledge" as KnowledgeCategory, directory: dir },
    ]);

    const topics = store.list();
    expect(topics).toHaveLength(2);
    expect(topics.map((t) => t.slug).sort()).toEqual([
      "constraints",
      "patterns",
    ]);
  });

  it("extracts title from first H1 heading", async () => {
    const dir = await createKnowledgeDir("knowledge", {
      "my-doc.md": "# My Document Title\n\nBody text.",
    });

    const store = await loadKnowledgeStore([
      { category: "knowledge" as KnowledgeCategory, directory: dir },
    ]);

    const doc = store.get("my-doc");
    expect(doc).toBeDefined();
    expect(doc!.title).toBe("My Document Title");
  });

  it("falls back to slug when no H1 heading", async () => {
    const dir = await createKnowledgeDir("knowledge", {
      "untitled.md": "No heading here, just content.",
    });

    const store = await loadKnowledgeStore([
      { category: "knowledge" as KnowledgeCategory, directory: dir },
    ]);

    const doc = store.get("untitled");
    expect(doc!.title).toBe("untitled");
  });

  it("prefixes slugs when duplicated across categories", async () => {
    const knowledgeDir = await createKnowledgeDir("knowledge", {
      "overlap.md": "# Knowledge Overlap\n\nFrom knowledge.",
    });
    const bpDir = await createKnowledgeDir("bestpractices", {
      "overlap.md": "# BP Overlap\n\nFrom best practices.",
    });

    const store = await loadKnowledgeStore([
      { category: "knowledge" as KnowledgeCategory, directory: knowledgeDir },
      {
        category: "bestpractices" as KnowledgeCategory,
        directory: bpDir,
      },
    ]);

    const topics = store.list();
    expect(topics).toHaveLength(2);
    expect(store.get("knowledge:overlap")).toBeDefined();
    expect(store.get("bestpractices:overlap")).toBeDefined();
  });

  it("filter returns only matching category", async () => {
    const knowledgeDir = await createKnowledgeDir("knowledge", {
      "a.md": "# A",
    });
    const bpDir = await createKnowledgeDir("bestpractices", {
      "b.md": "# B",
    });

    const store = await loadKnowledgeStore([
      { category: "knowledge" as KnowledgeCategory, directory: knowledgeDir },
      {
        category: "bestpractices" as KnowledgeCategory,
        directory: bpDir,
      },
    ]);

    const knowledgeTopics = store.filter("knowledge" as KnowledgeCategory);
    expect(knowledgeTopics).toHaveLength(1);
    expect(knowledgeTopics[0].category).toBe("knowledge");
  });

  it("ignores non-md files", async () => {
    const dir = await createKnowledgeDir("knowledge", {
      "doc.md": "# Doc",
      "readme.txt": "Not markdown",
      "data.json": "{}",
    });

    const store = await loadKnowledgeStore([
      { category: "knowledge" as KnowledgeCategory, directory: dir },
    ]);

    expect(store.list()).toHaveLength(1);
  });

  it("handles empty sources array", async () => {
    const store = await loadKnowledgeStore([]);
    expect(store.list()).toEqual([]);
  });

  it("handles non-existent directory gracefully", async () => {
    const store = await loadKnowledgeStore([
      {
        category: "knowledge" as KnowledgeCategory,
        directory: "/does/not/exist",
      },
    ]);
    expect(store.list()).toEqual([]);
  });

  it("get returns undefined for unknown slug", async () => {
    const store = await loadKnowledgeStore([]);
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("includes content in retrieved document", async () => {
    const dir = await createKnowledgeDir("knowledge", {
      "full.md": "# Full Doc\n\nDetailed content here.",
    });

    const store = await loadKnowledgeStore([
      { category: "knowledge" as KnowledgeCategory, directory: dir },
    ]);

    const doc = store.get("full");
    expect(doc!.content).toContain("Detailed content here.");
  });
});
