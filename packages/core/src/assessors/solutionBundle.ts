/**
 * In-memory CPS solution bundling.
 *
 * Hosted MCP servers (and chat-mode clients) often receive a CPS solution as
 * an uploaded archive instead of a filesystem path. This module reproduces
 * the same filtering, classification, noise-stripping, and markdown layout
 * used by `gatherSolutionSnapshot` + `formatAgentSnapshotMarkdown`, but
 * operates purely on an in-memory list of `{ path, content }` entries.
 *
 * Callers are responsible for ZIP extraction and text decoding. They pass
 * the resulting file list here and get back a single markdown bundle plus
 * structured AgentSnapshots and stats describing what was kept or dropped.
 */
import type { AgentSnapshot } from "../parsers/agentSnapshot.js";
import { formatAgentSnapshotMarkdown } from "../parsers/agentSnapshot.js";

export interface InMemoryFile {
  /** Archive-relative path with forward slashes. */
  path: string;
  /** Decoded text content. Binary files should be filtered out by the caller. */
  content: string;
}

export type CpsFileKind =
  | "settings"
  | "agentConfig"
  | "connectionReferences"
  | "topic"
  | "action"
  | "knowledge"
  | "solutionXml"
  | "botComponent"
  | "ignored";

export interface ClassifiedFile {
  path: string;
  /** Logical owner agent (workspace-relative directory path, "" if root). */
  agent: string;
  kind: CpsFileKind;
  /** Set when kind === "ignored" to explain why. */
  reason?: string;
}

export interface BundleOptions {
  /** Maximum bytes kept per file before truncation. Default 200,000. */
  perFileMaxBytes?: number;
  /** Maximum total bytes across all included file contents. Default 1,500,000. */
  totalMaxBytes?: number;
  /** Section header used at the top of the markdown bundle. Default "## Solution Under Review". */
  header?: string;
}

export interface BundleStats {
  filesIncluded: number;
  filesTruncated: number;
  filesSkipped: number;
  bytesIncluded: number;
  /** True when the total-byte cap was reached and later files were dropped. */
  totalTruncated: boolean;
  /** Per-reason counts for skipped files (path → reason aggregation). */
  droppedReasons: Record<string, number>;
}

export interface BundleResult {
  markdown: string;
  agents: AgentSnapshot[];
  stats: BundleStats;
}

const DEFAULT_PER_FILE_MAX_BYTES = 200_000;
const DEFAULT_TOTAL_MAX_BYTES = 1_500_000;
const DEFAULT_HEADER = "## Solution Under Review";
const TRUNCATION_NOTICE = "\n\n... [truncated by cps_bundle_solution] ...";

/** Normalize an archive path: forward slashes, no leading "./" or "/". */
function normalize(p: string): string {
  let out = p.replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
  while (out.startsWith("/")) out = out.slice(1);
  return out;
}

function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? p : p.slice(idx + 1);
}

/** True for paths that look like part of a cloned CPS agent folder. */
export function isClonedAgentFile(filePath: string): boolean {
  const kind = classifyCpsFile(filePath).kind;
  return (
    kind === "settings" ||
    kind === "agentConfig" ||
    kind === "connectionReferences" ||
    kind === "topic" ||
    kind === "action" ||
    kind === "knowledge"
  );
}

/** True for paths that look like part of an exported CPS solution archive. */
export function isSolutionFile(filePath: string): boolean {
  const kind = classifyCpsFile(filePath).kind;
  return kind === "solutionXml" || kind === "botComponent";
}

/**
 * Classify a single archive-relative path into a CPS file kind. Pure function;
 * does not read content. Path matching is permissive: leading directory
 * segments (e.g. an outer wrapper folder added by ZIP tooling) are ignored
 * when looking for the recognised file patterns.
 */
export function classifyCpsFile(filePath: string): ClassifiedFile {
  const norm = normalize(filePath);
  if (!norm || norm.endsWith("/")) {
    return { path: norm, agent: "", kind: "ignored", reason: "not-a-file" };
  }
  const segments = norm.split("/");
  const name = segments[segments.length - 1];

  // Solution-export shape (solution.xml at any depth, botcomponents/* anywhere).
  if (name === "solution.xml") {
    return { path: norm, agent: "", kind: "solutionXml" };
  }
  if (segments.includes("botcomponents")) {
    return { path: norm, agent: "", kind: "botComponent" };
  }

  // Cloned-agent shape. The agent root is the directory immediately containing
  // settings.yaml / settings.mcs.yml / agent.mcs.yml / topics/ / actions/ /
  // knowledge/. Walk backwards from `name` to find the recognised marker.
  const parentSegments = segments.slice(0, -1);

  if (name === "settings.yaml" || name === "settings.mcs.yml") {
    return { path: norm, agent: parentSegments.join("/"), kind: "settings" };
  }
  if (name === "agent.mcs.yml") {
    return {
      path: norm,
      agent: parentSegments.join("/"),
      kind: "agentConfig",
    };
  }
  if (name === "connectionreferences.mcs.yml") {
    return {
      path: norm,
      agent: parentSegments.join("/"),
      kind: "connectionReferences",
    };
  }

  // Folder-scoped buckets. Look for the last occurrence of the bucket name in
  // the parent chain so that `Agent/topics/foo.yml` and
  // `Solution/agents/Agent/topics/foo.yml` both classify correctly.
  const bucketKinds: Array<{ name: string; kind: CpsFileKind }> = [
    { name: "topics", kind: "topic" },
    { name: "actions", kind: "action" },
    { name: "knowledge", kind: "knowledge" },
  ];

  for (const { name: bucket, kind } of bucketKinds) {
    const bucketIdx = parentSegments.lastIndexOf(bucket);
    if (bucketIdx === -1) continue;
    const agent = parentSegments.slice(0, bucketIdx).join("/");
    const ext = name.toLowerCase();
    if (kind === "knowledge") {
      if (
        ext.endsWith(".yml") ||
        ext.endsWith(".yaml") ||
        ext.endsWith(".md")
      ) {
        return { path: norm, agent, kind };
      }
      return {
        path: norm,
        agent,
        kind: "ignored",
        reason: "unsupported-knowledge-extension",
      };
    }
    if (ext.endsWith(".yml") || ext.endsWith(".yaml")) {
      return { path: norm, agent, kind };
    }
    return {
      path: norm,
      agent,
      kind: "ignored",
      reason: `unsupported-${kind}-extension`,
    };
  }

  return {
    path: norm,
    agent: "",
    kind: "ignored",
    reason: "not-a-recognised-cps-file",
  };
}

function truncate(
  content: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  const buf = Buffer.byteLength(content, "utf8");
  if (buf <= maxBytes) return { text: content, truncated: false };
  // Byte-safe slice via Buffer to avoid splitting multibyte sequences.
  const sliced = Buffer.from(content, "utf8")
    .slice(0, maxBytes)
    .toString("utf8");
  return { text: sliced + TRUNCATION_NOTICE, truncated: true };
}

/**
 * Build the same markdown review bundle that `gatherSolutionSnapshot` produces
 * for a filesystem workspace, but from an in-memory file list.
 *
 * The caller is expected to have already unzipped the archive and decoded
 * each entry to text. Files that are not recognised cloned-agent or
 * solution-export artefacts are dropped (with a reason recorded in stats).
 */
export function bundleInMemorySolution(
  files: InMemoryFile[],
  options: BundleOptions = {},
): BundleResult {
  const perFileMax = options.perFileMaxBytes ?? DEFAULT_PER_FILE_MAX_BYTES;
  const totalMax = options.totalMaxBytes ?? DEFAULT_TOTAL_MAX_BYTES;
  const header = options.header ?? DEFAULT_HEADER;

  const stats: BundleStats = {
    filesIncluded: 0,
    filesTruncated: 0,
    filesSkipped: 0,
    bytesIncluded: 0,
    totalTruncated: false,
    droppedReasons: {},
  };

  const noteDropped = (reason: string): void => {
    stats.filesSkipped += 1;
    stats.droppedReasons[reason] = (stats.droppedReasons[reason] ?? 0) + 1;
  };

  // Bucket cloned-agent files by agent.
  const agentMap = new Map<
    string,
    {
      settings: string;
      agentConfig: string;
      connectionReferences: string;
      topics: Array<{ filename: string; content: string }>;
      actions: Array<{ filename: string; content: string }>;
      knowledge: Array<{ filename: string; content: string }>;
    }
  >();

  const ensureAgent = (
    name: string,
  ): NonNullable<ReturnType<typeof agentMap.get>> => {
    let bucket = agentMap.get(name);
    if (!bucket) {
      bucket = {
        settings: "",
        agentConfig: "",
        connectionReferences: "",
        topics: [],
        actions: [],
        knowledge: [],
      };
      agentMap.set(name, bucket);
    }
    return bucket;
  };

  const tryAdd = (
    content: string,
  ): { text: string; ok: boolean; truncated: boolean } => {
    if (stats.totalTruncated) {
      return { text: "", ok: false, truncated: false };
    }
    const remaining = totalMax - stats.bytesIncluded;
    if (remaining <= 0) {
      stats.totalTruncated = true;
      return { text: "", ok: false, truncated: false };
    }
    const cap = Math.min(perFileMax, remaining);
    const { text, truncated } = truncate(content, cap);
    stats.bytesIncluded += Buffer.byteLength(text, "utf8");
    stats.filesIncluded += 1;
    if (truncated) stats.filesTruncated += 1;
    if (stats.bytesIncluded >= totalMax) stats.totalTruncated = true;
    return { text, ok: true, truncated };
  };

  // Stable order: classify all first, then walk in path order.
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of ordered) {
    const classified = classifyCpsFile(file.path);
    if (classified.kind === "ignored") {
      noteDropped(classified.reason ?? "ignored");
      continue;
    }
    if (
      classified.kind === "solutionXml" ||
      classified.kind === "botComponent"
    ) {
      // Solution-export reconstruction (bot.xml / botcomponent.xml parsing) is
      // filesystem-specific in core today. Surface a clear reason so callers
      // know to fall back to `cps_parse_solution`.
      noteDropped(`solution-export-not-bundled:${classified.kind}`);
      continue;
    }

    const added = tryAdd(file.content);
    if (!added.ok) {
      noteDropped("total-cap-exceeded");
      continue;
    }

    const bucket = ensureAgent(classified.agent || "agent");
    const filename = basename(classified.path);
    switch (classified.kind) {
      case "settings":
        bucket.settings = added.text;
        break;
      case "agentConfig":
        bucket.agentConfig = added.text;
        break;
      case "connectionReferences":
        bucket.connectionReferences = added.text;
        break;
      case "topic":
        bucket.topics.push({ filename, content: added.text });
        break;
      case "action":
        bucket.actions.push({ filename, content: added.text });
        break;
      case "knowledge":
        bucket.knowledge.push({ filename, content: added.text });
        break;
    }
  }

  const agents: AgentSnapshot[] = [...agentMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, bucket]) => ({
      name,
      settings: bucket.settings,
      agentConfig: bucket.agentConfig,
      connectionReferences: bucket.connectionReferences,
      topics: bucket.topics.sort((a, b) =>
        a.filename.localeCompare(b.filename),
      ),
      actions: bucket.actions.sort((a, b) =>
        a.filename.localeCompare(b.filename),
      ),
      knowledge: bucket.knowledge.sort((a, b) =>
        a.filename.localeCompare(b.filename),
      ),
    }));

  const markdown = [header, "", formatAgentSnapshotMarkdown(agents)].join("\n");

  return { markdown, agents, stats };
}
