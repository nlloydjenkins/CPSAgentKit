import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  generateTopicScaffolds,
  detectDataverseMcp,
  composeDataverseChatPrompt,
  readRequirements,
  readAgentConnection,
} from "../../assessors/preBuildGenerator.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cps-prebuild-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── generateTopicScaffolds ───────────────────────────────────

describe("generateTopicScaffolds", () => {
  const ARCH_WITH_TOPICS = `# Architecture

## Agents

### IT Help Desk (Parent)

**Role:** Routes user queries
**Type:** Parent
**Tools:** None
**Knowledge sources:** None
**Key instructions:** Route to child agents

### Topics

| Topic | Description | Key Behaviour |
|-------|-------------|---------------|
| Password Reset | Handles password reset requests | Guides user through reset flow |
| VPN Access | Handles VPN configuration | Provides VPN setup instructions |

## Routing Logic

- "reset my password" | "forgot password" → **Password Reset**
- "connect to VPN" | "VPN not working" → **VPN Access**

## Tools & Connectors

| Tool | Owner Agent | Purpose | Manual Portal Step Required |
|------|-------------|---------|----------------------------|
| (none defined yet) | - | - | - |
`;

  it("generates scaffolds from architecture topics table", () => {
    const scaffolds = generateTopicScaffolds(ARCH_WITH_TOPICS);
    expect(scaffolds).toHaveLength(2);
    expect(scaffolds.map((s) => s.topicName).sort()).toEqual([
      "Password Reset",
      "VPN Access",
    ]);
  });

  it("generates valid YAML content", () => {
    const scaffolds = generateTopicScaffolds(ARCH_WITH_TOPICS);
    const passwordReset = scaffolds.find(
      (s) => s.topicName === "Password Reset",
    )!;
    expect(passwordReset.content).toContain("kind: AdaptiveDialog");
    expect(passwordReset.content).toContain("triggerQueries:");
    expect(passwordReset.content).toContain("reset my password");
    expect(passwordReset.content).toContain("forgot password");
  });

  it("generates PascalCase filenames", () => {
    const scaffolds = generateTopicScaffolds(ARCH_WITH_TOPICS);
    const passwordReset = scaffolds.find(
      (s) => s.topicName === "Password Reset",
    )!;
    expect(passwordReset.filename).toBe("PasswordReset.mcs.yml");
  });

  it("skips system topics", () => {
    const archWithSystem = `# Architecture

## Agents

### Agent

**Role:** Test
**Type:** Parent

### Topics

| Topic | Description | Key Behaviour |
|-------|-------------|---------------|
| Greeting | System greeting | Greets user |
| Escalation | System escalation | Escalates |
| Billing Inquiry | Handles bills | Routes to billing |
`;
    const scaffolds = generateTopicScaffolds(archWithSystem);
    expect(scaffolds).toHaveLength(1);
    expect(scaffolds[0].topicName).toBe("Billing Inquiry");
  });

  it("returns empty array when no topics section", () => {
    expect(generateTopicScaffolds("# No topics here")).toEqual([]);
  });

  it("falls back to topic name as trigger when no routing defined", () => {
    const archNoRouting = `# Architecture

## Agents

### Agent

**Role:** Test
**Type:** Parent

### Topics

| Topic | Description | Key Behaviour |
|-------|-------------|---------------|
| Custom Query | Handles custom queries | Processes them |
`;
    const scaffolds = generateTopicScaffolds(archNoRouting);
    expect(scaffolds[0].content).toContain("custom query");
  });
});

// ── detectDataverseMcp ───────────────────────────────────────

describe("detectDataverseMcp", () => {
  it("returns configured=false when no MCP config exists", async () => {
    const result = await detectDataverseMcp(tmpDir);
    expect(result.configured).toBe(false);
  });

  it("detects Dataverse MCP from .vscode/mcp.json", async () => {
    const vscodePath = path.join(tmpDir, ".vscode");
    await fs.mkdir(vscodePath, { recursive: true });
    await fs.writeFile(
      path.join(vscodePath, "mcp.json"),
      JSON.stringify({
        servers: {
          "dataverse-mcp": {
            url: "https://org1234.crm11.dynamics.com/api/mcp",
          },
        },
      }),
    );

    const result = await detectDataverseMcp(tmpDir);
    expect(result.configured).toBe(true);
    expect(result.serverName).toBe("dataverse-mcp");
    expect(result.url).toContain("dynamics.com");
    expect(result.environmentUrl).toBe("https://org1234.crm11.dynamics.com");
  });

  it("detects Dataverse MCP from extraServers", async () => {
    const result = await detectDataverseMcp(tmpDir, [
      {
        name: "my-dv-server",
        url: "https://orgabc.crm.dynamics.com/api/mcp",
      },
    ]);
    expect(result.configured).toBe(true);
    expect(result.serverName).toBe("my-dv-server");
  });

  it("ignores non-Dataverse MCP servers", async () => {
    const result = await detectDataverseMcp(tmpDir, [
      {
        name: "other-server",
        url: "https://example.com/api/mcp",
      },
    ]);
    expect(result.configured).toBe(false);
  });

  it("prefers .vscode/mcp.json over extraServers", async () => {
    const vscodePath = path.join(tmpDir, ".vscode");
    await fs.mkdir(vscodePath, { recursive: true });
    await fs.writeFile(
      path.join(vscodePath, "mcp.json"),
      JSON.stringify({
        servers: {
          "local-dv": {
            url: "https://local.crm11.dynamics.com/api/mcp",
          },
        },
      }),
    );

    const result = await detectDataverseMcp(tmpDir, [
      {
        name: "extra-dv",
        url: "https://extra.crm11.dynamics.com/api/mcp",
      },
    ]);
    expect(result.serverName).toBe("local-dv");
  });

  it("handles malformed mcp.json gracefully", async () => {
    const vscodePath = path.join(tmpDir, ".vscode");
    await fs.mkdir(vscodePath, { recursive: true });
    await fs.writeFile(path.join(vscodePath, "mcp.json"), "not json");

    const result = await detectDataverseMcp(tmpDir);
    expect(result.configured).toBe(false);
  });
});

// ── composeDataverseChatPrompt ───────────────────────────────

describe("composeDataverseChatPrompt", () => {
  const SPEC = "# Spec\n\n## Purpose\n\nManage IT incidents end to end.";
  const ARCH_WITH_DV = `# Architecture

## Tools & Connectors

| Tool | Owner Agent | Purpose | Manual Portal Step Required |
|------|-------------|---------|----------------------------|
| Microsoft Dataverse - List rows | IT Agent | Read incident rows | Yes |
| Microsoft Dataverse - Add a new row | IT Agent | Create new incidents | Yes |
| Custom MCP Server | Analyzer | Run analysis | No |
`;

  it("generates prompt when Dataverse tools exist", () => {
    const result = composeDataverseChatPrompt(SPEC, ARCH_WITH_DV);
    expect(result).toContain("Dataverse tables");
    expect(result).toContain("incident");
  });

  it("returns empty string when no Dataverse tools", () => {
    const archNoDv = `# Architecture

## Tools & Connectors

| Tool | Owner Agent | Purpose | Manual Portal Step Required |
|------|-------------|---------|----------------------------|
| Custom API | Agent | Call endpoint | No |
`;
    expect(composeDataverseChatPrompt(SPEC, archNoDv)).toBe("");
  });

  it("includes environment URL when provided", () => {
    const result = composeDataverseChatPrompt(
      SPEC,
      ARCH_WITH_DV,
      "https://org.crm11.dynamics.com",
    );
    expect(result).toContain("https://org.crm11.dynamics.com");
  });

  it("extracts purpose from spec", () => {
    const result = composeDataverseChatPrompt(SPEC, ARCH_WITH_DV);
    expect(result).toContain("Manage IT incidents end to end.");
  });
});

// ── readRequirements ─────────────────────────────────────────

describe("readRequirements", () => {
  it("reads spec and architecture from Requirements/", async () => {
    const reqDir = path.join(tmpDir, "Requirements");
    await fs.mkdir(reqDir, { recursive: true });
    await fs.writeFile(path.join(reqDir, "spec.md"), "# My Spec");
    await fs.writeFile(path.join(reqDir, "architecture.md"), "# My Arch");

    const result = await readRequirements(tmpDir);
    expect(result.spec).toBe("# My Spec");
    expect(result.architecture).toBe("# My Arch");
  });

  it("returns empty strings when files don't exist", async () => {
    const result = await readRequirements(tmpDir);
    expect(result.spec).toBe("");
    expect(result.architecture).toBe("");
    expect(result.docs).toEqual([]);
  });

  it("reads docs from Requirements/docs/", async () => {
    const docsDir = path.join(tmpDir, "Requirements", "docs");
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, "ref.md"), "# Reference");

    const result = await readRequirements(tmpDir);
    expect(result.docs).toHaveLength(1);
    expect(result.docs[0].filename).toBe("ref.md");
  });
});

// ── readAgentConnection ──────────────────────────────────────

describe("readAgentConnection", () => {
  it("returns null when no agents exist", async () => {
    const result = await readAgentConnection(tmpDir);
    expect(result).toBeNull();
  });

  it("reads connection from .mcs/conn.json", async () => {
    const agentDir = path.join(tmpDir, "TestAgent");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: test");
    await fs.mkdir(path.join(agentDir, "topics"));

    const mcsDir = path.join(agentDir, ".mcs");
    await fs.mkdir(mcsDir);
    await fs.writeFile(
      path.join(mcsDir, "conn.json"),
      JSON.stringify({
        DataverseEndpoint: "https://org.crm11.dynamics.com/",
        EnvironmentId: "env-123",
      }),
    );

    const result = await readAgentConnection(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.agentFolder).toBe("TestAgent");
    expect(result!.dataverseEndpoint).toBe("https://org.crm11.dynamics.com");
    expect(result!.environmentId).toBe("env-123");
  });

  it("returns null when conn.json is missing", async () => {
    const agentDir = path.join(tmpDir, "TestAgent");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: test");
    await fs.mkdir(path.join(agentDir, "topics"));

    const result = await readAgentConnection(tmpDir);
    expect(result).toBeNull();
  });

  it("skips conn.json with empty DataverseEndpoint", async () => {
    const agentDir = path.join(tmpDir, "TestAgent");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: test");
    await fs.mkdir(path.join(agentDir, "topics"));
    const mcsDir = path.join(agentDir, ".mcs");
    await fs.mkdir(mcsDir);
    await fs.writeFile(
      path.join(mcsDir, "conn.json"),
      JSON.stringify({ DataverseEndpoint: "", EnvironmentId: "" }),
    );

    const result = await readAgentConnection(tmpDir);
    expect(result).toBeNull();
  });

  it("skips conn.json with non-string DataverseEndpoint", async () => {
    const agentDir = path.join(tmpDir, "TestAgent");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: test");
    await fs.mkdir(path.join(agentDir, "topics"));
    const mcsDir = path.join(agentDir, ".mcs");
    await fs.mkdir(mcsDir);
    await fs.writeFile(
      path.join(mcsDir, "conn.json"),
      JSON.stringify({ DataverseEndpoint: 123, EnvironmentId: null }),
    );

    const result = await readAgentConnection(tmpDir);
    expect(result).toBeNull();
  });
});

// ── Additional branch coverage ───────────────────────────────

describe("composeDataverseChatPrompt (branch coverage)", () => {
  const ARCH_WITH_DV = `# Architecture

## Tools & Connectors

| Tool | Owner Agent | Purpose | Manual Portal Step Required |
|------|-------------|---------|----------------------------|
| Dataverse List Records | Agent | List records from table | No |
`;

  it("falls back to first non-heading line when spec has no Purpose section", () => {
    const specNoPurpose = "# Spec\n\nThis is a billing agent.";
    const result = composeDataverseChatPrompt(specNoPurpose, ARCH_WITH_DV);
    expect(result).toContain("This is a billing agent.");
  });

  it("falls back when Purpose section is just a template comment", () => {
    const specTemplate =
      "# Spec\n\n## Purpose\n\n<!-- One paragraph: what does this agent do and why? -->";
    const result = composeDataverseChatPrompt(specTemplate, ARCH_WITH_DV);
    // Should fall back to "(see spec.md)" since all lines are headings or comments
    expect(result).toContain("(see spec.md)");
  });

  it("strips comment lines from purpose section", () => {
    const specWithComment =
      "# Spec\n\n## Purpose\n\n<!-- Note -->\nManage incidents efficiently.";
    const result = composeDataverseChatPrompt(specWithComment, ARCH_WITH_DV);
    expect(result).toContain("Manage incidents efficiently.");
    expect(result).not.toContain("<!-- Note -->");
  });
});

describe("detectDataverseMcp (branch coverage)", () => {
  it("skips non-object server configs in mcp.json", async () => {
    const vscodePath = path.join(tmpDir, ".vscode");
    await fs.mkdir(vscodePath, { recursive: true });
    await fs.writeFile(
      path.join(vscodePath, "mcp.json"),
      JSON.stringify({
        servers: {
          "null-server": null,
          "string-server": "not-an-object",
        },
      }),
    );

    const result = await detectDataverseMcp(tmpDir);
    expect(result.configured).toBe(false);
  });

  it("skips mcp.json where servers is an array", async () => {
    const vscodePath = path.join(tmpDir, ".vscode");
    await fs.mkdir(vscodePath, { recursive: true });
    await fs.writeFile(
      path.join(vscodePath, "mcp.json"),
      JSON.stringify({
        servers: [{ url: "https://org.crm.dynamics.com/api/mcp" }],
      }),
    );

    const result = await detectDataverseMcp(tmpDir);
    expect(result.configured).toBe(false);
  });

  it("skips mcp.json where root is an array", async () => {
    const vscodePath = path.join(tmpDir, ".vscode");
    await fs.mkdir(vscodePath, { recursive: true });
    await fs.writeFile(path.join(vscodePath, "mcp.json"), "[]");

    const result = await detectDataverseMcp(tmpDir);
    expect(result.configured).toBe(false);
  });

  it("skips server entries without url field", async () => {
    const vscodePath = path.join(tmpDir, ".vscode");
    await fs.mkdir(vscodePath, { recursive: true });
    await fs.writeFile(
      path.join(vscodePath, "mcp.json"),
      JSON.stringify({
        servers: {
          "no-url-server": { command: "npx some-tool" },
        },
      }),
    );

    const result = await detectDataverseMcp(tmpDir);
    expect(result.configured).toBe(false);
  });

  it("skips extraServers entries without url", async () => {
    const result = await detectDataverseMcp(tmpDir, [{ name: "no-url" }]);
    expect(result.configured).toBe(false);
  });

  it("detects crm URL without dynamics.com", async () => {
    const result = await detectDataverseMcp(tmpDir, [
      {
        name: "crm-mcp",
        url: "https://org.crm4.test.invalid/api/mcp",
      },
    ]);
    // crm + /api/mcp matches
    expect(result.configured).toBe(true);
  });

  it("handles invalid URL format gracefully in extractEnvironmentUrl", async () => {
    // A URL without protocol will fail URL parsing, testing the catch fallback
    const result = await detectDataverseMcp(tmpDir, [
      {
        name: "bad-url-server",
        url: "crm.local/api/mcp",
      },
    ]);
    expect(result.configured).toBe(true);
    expect(result.environmentUrl).toBe("crm.local");
  });
});

describe("generateTopicScaffolds (branch coverage)", () => {
  it("handles topic names with special YAML characters", () => {
    const arch = `# Architecture

## Agents

### Agent

**Role:** Test
**Type:** Parent

### Topics

| Topic | Description | Key Behaviour |
|-------|-------------|---------------|
| Status: Open | Handles "open" status items | Checks status |
`;
    const scaffolds = generateTopicScaffolds(arch);
    expect(scaffolds).toHaveLength(1);
    // The description has quotes - verify it gets escaped in YAML
    expect(scaffolds[0].topicName).toBe("Status: Open");
    expect(scaffolds[0].content).toContain("kind: AdaptiveDialog");
    // Description with special chars should be quoted
    expect(scaffolds[0].content).toContain('description: "Handles');
  });

  it("returns empty when Agents section missing", () => {
    const arch = `# Architecture

## Overview

Just an overview.
`;
    expect(generateTopicScaffolds(arch)).toEqual([]);
  });
});
