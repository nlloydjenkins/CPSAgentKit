import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  stripSettingsNoise,
  detectFenceLanguage,
  formatAgentSnapshotMarkdown,
  readAgentSnapshot,
  gatherAgentSnapshot,
  readRequirementsDocs,
  readBestPracticesDocs,
} from "../../parsers/agentSnapshot.js";
import type { AgentSnapshot } from "../../types/index.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cps-snapshot-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── stripSettingsNoise ───────────────────────────────────────

describe("stripSettingsNoise", () => {
  it("removes iconbase64 block", () => {
    const input = "before<iconbase64>longbase64data==</iconbase64>after";
    expect(stripSettingsNoise(input)).toBe("beforeafter");
  });

  it("removes synchronizationstatus block", () => {
    const input =
      "before<synchronizationstatus>some xml</synchronizationstatus>after";
    expect(stripSettingsNoise(input)).toBe("beforeafter");
  });

  it("removes both blocks", () => {
    const input =
      "<iconbase64>x</iconbase64>\n\n\n\n<synchronizationstatus>y</synchronizationstatus>";
    const result = stripSettingsNoise(input);
    expect(result).not.toContain("iconbase64");
    expect(result).not.toContain("synchronizationstatus");
  });

  it("collapses excessive blank lines to double newlines", () => {
    const input = "line1\n\n\n\n\nline2";
    expect(stripSettingsNoise(input)).toBe("line1\n\nline2");
  });

  it("passes through clean settings unchanged (except whitespace)", () => {
    const input = "key: value\nanother: setting";
    expect(stripSettingsNoise(input)).toBe(input);
  });

  it("handles multiline iconbase64 content", () => {
    const input = "before<iconbase64>\nline1\nline2\n</iconbase64>after";
    expect(stripSettingsNoise(input)).toBe("beforeafter");
  });
});

// ── detectFenceLanguage ──────────────────────────────────────

describe("detectFenceLanguage", () => {
  it("detects XML", () => {
    expect(detectFenceLanguage("<root><child /></root>")).toBe("xml");
  });

  it("detects XML declaration", () => {
    expect(detectFenceLanguage("<?xml version='1.0'?>")).toBe("xml");
  });

  it("detects JSON object", () => {
    expect(detectFenceLanguage('{"key": "value"}')).toBe("json");
  });

  it("detects JSON array", () => {
    expect(detectFenceLanguage("[1, 2, 3]")).toBe("json");
  });

  it("defaults to yaml", () => {
    expect(detectFenceLanguage("key: value\nanother: setting")).toBe("yaml");
  });

  it("handles leading whitespace", () => {
    expect(detectFenceLanguage("  \n  <root/>")).toBe("xml");
  });
});

// ── formatAgentSnapshotMarkdown ──────────────────────────────

describe("formatAgentSnapshotMarkdown", () => {
  const makeAgent = (
    overrides: Partial<AgentSnapshot> = {},
  ): AgentSnapshot => ({
    name: "TestAgent",
    settings: "key: value",
    agentConfig: "",
    connectionReferences: "",
    topics: [],
    actions: [],
    knowledge: [],
    ...overrides,
  });

  it("formats a minimal agent", () => {
    const result = formatAgentSnapshotMarkdown([makeAgent()]);
    expect(result).toContain("### Agent: TestAgent");
    expect(result).toContain("#### settings");
    expect(result).toContain("key: value");
  });

  it("includes agent config when present", () => {
    const result = formatAgentSnapshotMarkdown([
      makeAgent({ agentConfig: '{"schemaVersion": "1.2"}' }),
    ]);
    expect(result).toContain("#### agent config");
    expect(result).toContain("```json");
  });

  it("includes connection references when present", () => {
    const result = formatAgentSnapshotMarkdown([
      makeAgent({ connectionReferences: "ref: abc" }),
    ]);
    expect(result).toContain("#### connection references");
  });

  it("includes topics", () => {
    const result = formatAgentSnapshotMarkdown([
      makeAgent({
        topics: [{ filename: "greeting.yaml", content: "trigger: hello" }],
      }),
    ]);
    expect(result).toContain("#### topics");
    expect(result).toContain("**greeting.yaml**");
  });

  it("includes actions", () => {
    const result = formatAgentSnapshotMarkdown([
      makeAgent({
        actions: [{ filename: "search.yaml", content: "kind: action" }],
      }),
    ]);
    expect(result).toContain("#### actions");
    expect(result).toContain("**search.yaml**");
  });

  it("detects XML fence language for actions starting with <", () => {
    const result = formatAgentSnapshotMarkdown([
      makeAgent({
        actions: [
          { filename: "flow.xml", content: "<workflow><step/></workflow>" },
        ],
      }),
    ]);
    expect(result).toContain("```xml");
  });

  it("detects JSON fence language for actions starting with [", () => {
    const result = formatAgentSnapshotMarkdown([
      makeAgent({
        actions: [{ filename: "data.json", content: '[{"id": 1}]' }],
      }),
    ]);
    expect(result).toContain("```json");
  });

  it("includes knowledge with .md fence type", () => {
    const result = formatAgentSnapshotMarkdown([
      makeAgent({
        knowledge: [{ filename: "rules.md", content: "# Rules" }],
      }),
    ]);
    expect(result).toContain("```markdown");
  });

  it("formats multiple agents", () => {
    const result = formatAgentSnapshotMarkdown([
      makeAgent({ name: "Agent1" }),
      makeAgent({ name: "Agent2" }),
    ]);
    expect(result).toContain("### Agent: Agent1");
    expect(result).toContain("### Agent: Agent2");
  });

  it("returns empty string for empty array", () => {
    expect(formatAgentSnapshotMarkdown([])).toBe("");
  });
});

// ── readAgentSnapshot ────────────────────────────────────────

describe("readAgentSnapshot", () => {
  it("reads a full agent folder", async () => {
    const agentDir = path.join(tmpDir, "MyAgent");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: MyAgent");
    await fs.mkdir(path.join(agentDir, "topics"));
    await fs.writeFile(
      path.join(agentDir, "topics", "greeting.yaml"),
      "trigger: hi",
    );
    await fs.mkdir(path.join(agentDir, "actions"));
    await fs.writeFile(
      path.join(agentDir, "actions", "search.yaml"),
      "kind: action",
    );
    await fs.mkdir(path.join(agentDir, "knowledge"));
    await fs.writeFile(path.join(agentDir, "knowledge", "rules.md"), "# Rules");

    const snapshot = await readAgentSnapshot(tmpDir, "MyAgent");
    expect(snapshot.name).toBe("MyAgent");
    expect(snapshot.settings).toBe("name: MyAgent");
    expect(snapshot.topics).toHaveLength(1);
    expect(snapshot.topics[0].filename).toBe("greeting.yaml");
    expect(snapshot.actions).toHaveLength(1);
    expect(snapshot.knowledge).toHaveLength(1);
  });

  it("reads settings.mcs.yml when settings.yaml absent", async () => {
    const agentDir = path.join(tmpDir, "Agent2");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.mcs.yml"), "name: Agent2");
    await fs.mkdir(path.join(agentDir, "topics"));

    const snapshot = await readAgentSnapshot(tmpDir, "Agent2");
    expect(snapshot.settings).toBe("name: Agent2");
  });

  it("reads agent.mcs.yml when present", async () => {
    const agentDir = path.join(tmpDir, "Agent3");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: A3");
    await fs.writeFile(path.join(agentDir, "agent.mcs.yml"), "agent: config");
    await fs.mkdir(path.join(agentDir, "topics"));

    const snapshot = await readAgentSnapshot(tmpDir, "Agent3");
    expect(snapshot.agentConfig).toBe("agent: config");
  });

  it("reads connectionreferences.mcs.yml when present", async () => {
    const agentDir = path.join(tmpDir, "Agent4");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: A4");
    await fs.writeFile(
      path.join(agentDir, "connectionreferences.mcs.yml"),
      "ref: abc",
    );
    await fs.mkdir(path.join(agentDir, "topics"));

    const snapshot = await readAgentSnapshot(tmpDir, "Agent4");
    expect(snapshot.connectionReferences).toBe("ref: abc");
  });

  it("handles missing optional directories gracefully", async () => {
    const agentDir = path.join(tmpDir, "MinAgent");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: min");
    // No topics, actions, or knowledge dirs

    const snapshot = await readAgentSnapshot(tmpDir, "MinAgent");
    expect(snapshot.settings).toBe("name: min");
    expect(snapshot.topics).toEqual([]);
    expect(snapshot.actions).toEqual([]);
    expect(snapshot.knowledge).toEqual([]);
  });
});

// ── gatherAgentSnapshot ──────────────────────────────────────

describe("gatherAgentSnapshot", () => {
  it("gathers all agent snapshots from workspace", async () => {
    for (const name of ["AgentA", "AgentB"]) {
      const dir = path.join(tmpDir, name);
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, "settings.yaml"), `name: ${name}`);
      await fs.mkdir(path.join(dir, "topics"));
    }

    const snapshots = await gatherAgentSnapshot(tmpDir);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((s) => s.name).sort()).toEqual(["AgentA", "AgentB"]);
  });

  it("returns empty array when no agents", async () => {
    const snapshots = await gatherAgentSnapshot(tmpDir);
    expect(snapshots).toEqual([]);
  });
});

// ── readRequirementsDocs ─────────────────────────────────────

describe("readRequirementsDocs", () => {
  it("reads spec, architecture, and docs", async () => {
    const reqDir = path.join(tmpDir, "Requirements");
    await fs.mkdir(reqDir, { recursive: true });
    await fs.writeFile(path.join(reqDir, "spec.md"), "# My Spec");
    await fs.writeFile(path.join(reqDir, "architecture.md"), "# Arch");
    const docsDir = path.join(reqDir, "docs");
    await fs.mkdir(docsDir);
    await fs.writeFile(path.join(docsDir, "ref.md"), "# Reference");

    const result = await readRequirementsDocs(tmpDir);
    expect(result.spec).toBe("# My Spec");
    expect(result.architecture).toBe("# Arch");
    expect(result.docs).toHaveLength(1);
  });

  it("returns empty strings when Requirements/ missing", async () => {
    const result = await readRequirementsDocs(tmpDir);
    expect(result.spec).toBe("");
    expect(result.architecture).toBe("");
    expect(result.docs).toEqual([]);
  });
});

// ── readBestPracticesDocs ────────────────────────────────────

describe("readBestPracticesDocs", () => {
  it("reads best practice markdown files", async () => {
    const bpDir = path.join(tmpDir, ".cpsagentkit", "bestpractices");
    await fs.mkdir(bpDir, { recursive: true });
    await fs.writeFile(
      path.join(bpDir, "part1.md"),
      "# Platform Best Practices",
    );

    const result = await readBestPracticesDocs(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("part1.md");
  });

  it("returns empty when directory missing", async () => {
    const result = await readBestPracticesDocs(tmpDir);
    expect(result).toEqual([]);
  });
});
