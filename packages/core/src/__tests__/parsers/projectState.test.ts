import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { detectProjectState } from "../../parsers/projectState.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cps-project-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("detectProjectState", () => {
  it("returns all-false for an empty workspace", async () => {
    const state = await detectProjectState(tmpDir);
    expect(state.isInitialised).toBe(false);
    expect(state.hasSpec).toBe(false);
    expect(state.hasArchitecture).toBe(false);
    expect(state.hasKnowledge).toBe(false);
    expect(state.hasRequirementsDocs).toBe(false);
    expect(state.hasBestPractices).toBe(false);
    expect(state.hasCpsExtensionAgent).toBe(false);
    expect(state.agentFolders).toEqual([]);
  });

  it("detects .cpsagentkit directory as initialised", async () => {
    await fs.mkdir(path.join(tmpDir, ".cpsagentkit"));
    const state = await detectProjectState(tmpDir);
    expect(state.isInitialised).toBe(true);
  });

  it("detects knowledge directory", async () => {
    await fs.mkdir(path.join(tmpDir, ".cpsagentkit", "knowledge"), {
      recursive: true,
    });
    const state = await detectProjectState(tmpDir);
    expect(state.hasKnowledge).toBe(true);
  });

  it("detects best practices directory", async () => {
    await fs.mkdir(path.join(tmpDir, ".cpsagentkit", "bestpractices"), {
      recursive: true,
    });
    const state = await detectProjectState(tmpDir);
    expect(state.hasBestPractices).toBe(true);
  });

  it("detects requirements docs with files", async () => {
    const docsDir = path.join(tmpDir, "Requirements", "docs");
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, "info.md"), "# Info");
    const state = await detectProjectState(tmpDir);
    expect(state.hasRequirementsDocs).toBe(true);
  });

  it("returns false for empty requirements docs directory", async () => {
    const docsDir = path.join(tmpDir, "Requirements", "docs");
    await fs.mkdir(docsDir, { recursive: true });
    const state = await detectProjectState(tmpDir);
    expect(state.hasRequirementsDocs).toBe(false);
  });

  it("detects CPS agent folders", async () => {
    const agentDir = path.join(tmpDir, "TestAgent");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: test");
    await fs.mkdir(path.join(agentDir, "topics"));

    const state = await detectProjectState(tmpDir);
    expect(state.hasCpsExtensionAgent).toBe(true);
    expect(state.agentFolders).toEqual(["TestAgent"]);
  });

  it("detects customised spec (different from template)", async () => {
    // Create template
    const templateDir = path.join(tmpDir, "templates");
    await fs.mkdir(templateDir, { recursive: true });
    await fs.writeFile(
      path.join(templateDir, "spec-template.md"),
      "# Template\n\n-",
    );
    await fs.writeFile(
      path.join(templateDir, "architecture-template.md"),
      "# Arch Template\n\n-",
    );

    // Create customised spec
    const reqDir = path.join(tmpDir, "Requirements");
    await fs.mkdir(reqDir, { recursive: true });
    await fs.writeFile(
      path.join(reqDir, "spec.md"),
      "# My Agent Spec\n\nThis agent handles billing inquiries.",
    );

    const state = await detectProjectState(tmpDir);
    expect(state.hasSpec).toBe(true);
  });

  it("returns false for spec identical to template", async () => {
    const templateContent = "# Spec Template\n\n-";
    const templateDir = path.join(tmpDir, "templates");
    await fs.mkdir(templateDir, { recursive: true });
    await fs.writeFile(
      path.join(templateDir, "spec-template.md"),
      templateContent,
    );
    await fs.writeFile(
      path.join(templateDir, "architecture-template.md"),
      "# Arch",
    );

    const reqDir = path.join(tmpDir, "Requirements");
    await fs.mkdir(reqDir, { recursive: true });
    await fs.writeFile(path.join(reqDir, "spec.md"), templateContent);

    const state = await detectProjectState(tmpDir);
    expect(state.hasSpec).toBe(false);
  });

  it("returns false for untouched scaffolded Requirements docs without template files", async () => {
    const reqDir = path.join(tmpDir, "Requirements");
    await fs.mkdir(reqDir, { recursive: true });
    await fs.writeFile(
      path.join(reqDir, "spec.md"),
      [
        "# Agent Spec",
        "",
        "<!-- Tell GHCP what you need. It will help you fill this out. -->",
        "",
        "## Purpose",
        "",
        "<!-- One paragraph: what does this agent do and why? -->",
        "",
        "## What it should do",
        "",
        "-",
        "",
        "## Users & Channel",
        "",
        "- **Primary users:**",
        "- **User auth state:** Authenticated (Entra ID) / Anonymous / Mixed",
        "",
        "## Reference documents",
        "",
        "| Document | Description |",
        "| -------- | ----------- |",
        "|          |             |",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(reqDir, "architecture.md"),
      [
        "# Agent Architecture",
        "",
        "<!-- GHCP generates this from the spec. Do not edit manually unless refining. -->",
        "",
        "## Overview",
        "",
        "<!-- High-level description of the solution architecture -->",
        "",
        "## Agents",
        "",
        "<!-- List each agent, its role, and its scope",
        "     Multi-line template guidance should not count as authored content. -->",
        "",
        "### [Agent Name]",
        "",
        "- **Role:**",
        "- **Type:** parent / child / connected",
        "- **Tools:**",
        "",
        "## Build State",
        "",
        "- [ ] Spec complete",
      ].join("\n"),
    );

    const state = await detectProjectState(tmpDir);
    expect(state.hasSpec).toBe(false);
    expect(state.hasArchitecture).toBe(false);
  });

  it("detects authored Requirements docs without template files", async () => {
    const reqDir = path.join(tmpDir, "Requirements");
    await fs.mkdir(reqDir, { recursive: true });
    await fs.writeFile(
      path.join(reqDir, "spec.md"),
      "# Agent Spec\n\n## Purpose\n\nHelp service desk analysts triage incidents.",
    );
    await fs.writeFile(
      path.join(reqDir, "architecture.md"),
      "# Agent Architecture\n\n## Overview\n\nSingle parent agent with Dataverse ticket lookup.",
    );

    const state = await detectProjectState(tmpDir);
    expect(state.hasSpec).toBe(true);
    expect(state.hasArchitecture).toBe(true);
  });
});
