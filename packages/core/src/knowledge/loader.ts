import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  KnowledgeCategory,
  KnowledgeDocument,
  KnowledgeTopic,
} from "../types/index.js";

/** Absolute directory paths containing markdown knowledge files. */
export interface KnowledgeSource {
  category: KnowledgeCategory;
  directory: string;
}

export interface KnowledgeStore {
  list(): KnowledgeTopic[];
  get(slug: string): KnowledgeDocument | undefined;
  filter(category: KnowledgeCategory): KnowledgeTopic[];
}

interface LoadedDoc extends KnowledgeDocument {}

function slugFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, "");
}

function titleFromMarkdown(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : fallback;
}

async function readMarkdownDir(
  directory: string,
  category: KnowledgeCategory,
): Promise<LoadedDoc[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch {
    return [];
  }
  const markdown = entries.filter((n) => n.toLowerCase().endsWith(".md")).sort();
  const docs: LoadedDoc[] = [];
  for (const filename of markdown) {
    const absPath = path.join(directory, filename);
    const content = await fs.readFile(absPath, "utf8");
    const slug = slugFromFilename(filename);
    docs.push({
      slug,
      title: titleFromMarkdown(content, slug),
      category,
      path: path.relative(path.dirname(directory), absPath).replace(/\\/g, "/"),
      content,
    });
  }
  return docs;
}

/**
 * Load every knowledge/best-practice markdown file into memory.
 * Pass the absolute paths the consumer wants to serve.
 */
export async function loadKnowledgeStore(
  sources: KnowledgeSource[],
): Promise<KnowledgeStore> {
  const loaded: LoadedDoc[] = [];
  for (const source of sources) {
    loaded.push(...(await readMarkdownDir(source.directory, source.category)));
  }

  // Detect duplicate slugs across categories — prefix with category to keep
  // them addressable (e.g. `bestpractices:part1-platform`).
  const slugCounts = new Map<string, number>();
  for (const doc of loaded) {
    slugCounts.set(doc.slug, (slugCounts.get(doc.slug) ?? 0) + 1);
  }

  const byKey = new Map<string, LoadedDoc>();
  for (const doc of loaded) {
    const key =
      (slugCounts.get(doc.slug) ?? 0) > 1
        ? `${doc.category}:${doc.slug}`
        : doc.slug;
    const finalDoc: LoadedDoc = { ...doc, slug: key };
    byKey.set(key, finalDoc);
  }

  const topics: KnowledgeTopic[] = Array.from(byKey.values()).map(
    ({ slug, title, category, path: p }) => ({ slug, title, category, path: p }),
  );

  return {
    list: () => topics.slice(),
    get: (slug) => byKey.get(slug),
    filter: (category) => topics.filter((t) => t.category === category),
  };
}
