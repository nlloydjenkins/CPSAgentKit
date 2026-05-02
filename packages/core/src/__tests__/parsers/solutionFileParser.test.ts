import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  isSolutionFileFolder,
  parseSolutionMetadata,
  parseSolutionFile,
  findSolutionFolders,
} from "../../parsers/solutionFileParser.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cps-solution-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const SOLUTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml>
  <SolutionManifest>
    <UniqueName>MyTestSolution</UniqueName>
    <LocalizedNames>
      <LocalizedName description="My Test Solution" languagecode="1033" />
    </LocalizedNames>
    <Version>1.2.3.4</Version>
    <Publisher>
      <UniqueName>testpublisher</UniqueName>
    </Publisher>
  </SolutionManifest>
</ImportExportXml>`;

describe("isSolutionFileFolder", () => {
  it("returns true when solution.xml and botcomponents/ exist", async () => {
    await fs.writeFile(path.join(tmpDir, "solution.xml"), SOLUTION_XML);
    await fs.mkdir(path.join(tmpDir, "botcomponents"));
    expect(await isSolutionFileFolder(tmpDir)).toBe(true);
  });

  it("returns false when solution.xml is missing", async () => {
    await fs.mkdir(path.join(tmpDir, "botcomponents"));
    expect(await isSolutionFileFolder(tmpDir)).toBe(false);
  });

  it("returns false when botcomponents/ is missing", async () => {
    await fs.writeFile(path.join(tmpDir, "solution.xml"), SOLUTION_XML);
    expect(await isSolutionFileFolder(tmpDir)).toBe(false);
  });

  it("returns false for empty directory", async () => {
    expect(await isSolutionFileFolder(tmpDir)).toBe(false);
  });
});

describe("parseSolutionMetadata", () => {
  it("extracts metadata from solution.xml", async () => {
    await fs.writeFile(path.join(tmpDir, "solution.xml"), SOLUTION_XML);
    const meta = await parseSolutionMetadata(tmpDir);
    expect(meta.uniqueName).toBe("MyTestSolution");
    expect(meta.displayName).toBe("My Test Solution");
    expect(meta.version).toBe("1.2.3.4");
    expect(meta.publisher).toBe("testpublisher");
  });

  it("falls back to defaults for minimal XML", async () => {
    await fs.writeFile(
      path.join(tmpDir, "solution.xml"),
      "<ImportExportXml><SolutionManifest></SolutionManifest></ImportExportXml>",
    );
    const meta = await parseSolutionMetadata(tmpDir);
    expect(meta.uniqueName).toBe("Unknown");
    expect(meta.version).toBe("0.0.0.0");
    expect(meta.publisher).toBe("Unknown");
  });
});

// ── findSolutionFolders ──────────────────────────────────────

describe("findSolutionFolders", () => {
  it("finds solution folders in a directory", async () => {
    const solDir = path.join(tmpDir, "MySolution");
    await fs.mkdir(solDir);
    await fs.writeFile(path.join(solDir, "solution.xml"), SOLUTION_XML);
    await fs.mkdir(path.join(solDir, "botcomponents"));

    const results = await findSolutionFolders(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(solDir);
  });

  it("returns empty for directory with no solutions", async () => {
    await fs.mkdir(path.join(tmpDir, "regular-folder"));
    const results = await findSolutionFolders(tmpDir);
    expect(results).toEqual([]);
  });

  it("skips dot directories", async () => {
    const dotDir = path.join(tmpDir, ".hidden");
    await fs.mkdir(dotDir);
    await fs.writeFile(path.join(dotDir, "solution.xml"), SOLUTION_XML);
    await fs.mkdir(path.join(dotDir, "botcomponents"));

    const results = await findSolutionFolders(tmpDir);
    expect(results).toEqual([]);
  });

  it("returns empty for non-existent directory", async () => {
    const results = await findSolutionFolders("/does/not/exist");
    expect(results).toEqual([]);
  });
});

// ── parseSolutionFile ────────────────────────────────────────

describe("parseSolutionFile", () => {
  it("parses a solution with bots and botcomponents", async () => {
    // Create bots directory
    const botsDir = path.join(tmpDir, "bots", "cr123_mybot");
    await fs.mkdir(botsDir, { recursive: true });
    await fs.writeFile(
      path.join(botsDir, "bot.xml"),
      "<bot><name>My Test Bot</name></bot>",
    );
    await fs.writeFile(
      path.join(botsDir, "configuration.json"),
      '{"config": true}',
    );

    // Create botcomponents directory with a topic
    const compDir = path.join(
      tmpDir,
      "botcomponents",
      "cr123_mybot.topic.greeting",
    );
    await fs.mkdir(compDir, { recursive: true });
    await fs.writeFile(
      path.join(compDir, "botcomponent.xml"),
      '<botcomponent schemaname="cr123_mybot.topic.greeting"><name>Greeting</name><description>Greets users</description><statecode>0</statecode><statuscode>1</statuscode></botcomponent>',
    );
    await fs.writeFile(path.join(compDir, "data"), "trigger: hello");

    const agents = await parseSolutionFile(tmpDir);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("My Test Bot");
    expect(agents[0].agentConfig).toBe('{"config": true}');
    expect(agents[0].topics).toHaveLength(1);
    expect(agents[0].topics[0].filename).toBe("Greeting");
    expect(agents[0].topics[0].content).toContain("Greeting");
    expect(agents[0].topics[0].content).toContain("trigger: hello");
  });

  it("handles solution with no bots gracefully", async () => {
    const agents = await parseSolutionFile(tmpDir);
    expect(agents).toEqual([]);
  });

  it("skips botcomponent directories without botcomponent.xml", async () => {
    const botsDir = path.join(tmpDir, "bots", "cr123_mybot");
    await fs.mkdir(botsDir, { recursive: true });
    await fs.writeFile(
      path.join(botsDir, "bot.xml"),
      "<bot><name>My Bot</name></bot>",
    );

    // Create a botcomponent directory without the required xml file
    const compDir = path.join(
      tmpDir,
      "botcomponents",
      "cr123_mybot.topic.broken",
    );
    await fs.mkdir(compDir, { recursive: true });
    // No botcomponent.xml — should be skipped gracefully

    const agents = await parseSolutionFile(tmpDir);
    expect(agents).toHaveLength(1);
    expect(agents[0].topics).toHaveLength(0);
  });

  it("handles envvar directory with missing xml gracefully", async () => {
    const botsDir = path.join(tmpDir, "bots", "cr_bot");
    await fs.mkdir(botsDir, { recursive: true });
    await fs.writeFile(
      path.join(botsDir, "bot.xml"),
      "<bot><name>Bot</name></bot>",
    );

    // envvar directory exists but has no xml
    const envDir = path.join(
      tmpDir,
      "environmentvariabledefinitions",
      "broken_var",
    );
    await fs.mkdir(envDir, { recursive: true });
    // No xml file inside

    const agents = await parseSolutionFile(tmpDir);
    expect(agents[0].knowledge).toHaveLength(0);
  });

  it("skips non-directory entries inside bots folder", async () => {
    const botsDir = path.join(tmpDir, "bots");
    await fs.mkdir(botsDir, { recursive: true });
    // Create a file (not directory) in the bots folder
    await fs.writeFile(path.join(botsDir, "readme.txt"), "ignore me");
    // Create a proper bot directory
    const botDir = path.join(botsDir, "cr_bot");
    await fs.mkdir(botDir);
    await fs.writeFile(
      path.join(botDir, "bot.xml"),
      "<bot><name>Bot</name></bot>",
    );

    // Create minimal botcomponents
    await fs.mkdir(path.join(tmpDir, "botcomponents"), { recursive: true });

    const agents = await parseSolutionFile(tmpDir);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("Bot");
  });

  it("handles bot with missing botcomponents directory", async () => {
    const botsDir = path.join(tmpDir, "bots", "cr_bot");
    await fs.mkdir(botsDir, { recursive: true });
    await fs.writeFile(
      path.join(botsDir, "bot.xml"),
      "<bot><name>Bot</name></bot>",
    );
    // No botcomponents directory at all

    const agents = await parseSolutionFile(tmpDir);
    expect(agents).toHaveLength(1);
    expect(agents[0].topics).toHaveLength(0);
  });

  it("includes Workflows as actions", async () => {
    // Create empty bots
    const botsDir = path.join(tmpDir, "bots", "cr_bot");
    await fs.mkdir(botsDir, { recursive: true });
    await fs.writeFile(
      path.join(botsDir, "bot.xml"),
      "<bot><name>Bot</name></bot>",
    );

    // Create workflows
    const wfDir = path.join(tmpDir, "Workflows");
    await fs.mkdir(wfDir);
    await fs.writeFile(path.join(wfDir, "flow1.json"), '{"definition": {}}');

    const agents = await parseSolutionFile(tmpDir);
    expect(agents).toHaveLength(1);
    expect(agents[0].actions).toHaveLength(1);
    expect(agents[0].actions[0].filename).toBe("flow1.json");
  });

  it("includes environment variables as knowledge", async () => {
    const botsDir = path.join(tmpDir, "bots", "cr_bot");
    await fs.mkdir(botsDir, { recursive: true });
    await fs.writeFile(
      path.join(botsDir, "bot.xml"),
      "<bot><name>Bot</name></bot>",
    );

    const envDir = path.join(tmpDir, "environmentvariabledefinitions", "myvar");
    await fs.mkdir(envDir, { recursive: true });
    await fs.writeFile(
      path.join(envDir, "environmentvariabledefinition.xml"),
      "<env>value</env>",
    );

    const agents = await parseSolutionFile(tmpDir);
    expect(agents[0].knowledge).toHaveLength(1);
    expect(agents[0].knowledge[0].filename).toBe("environment-variables.xml");
  });
});
