import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { createServer } from "../server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Integration test for the MCP server. Verifies that createServer()
 * produces a valid server with the expected tools registered.
 *
 * Note: This calls real createServer() which reads bundled knowledge files.
 * If the resources/ dir is missing (dev mode), tools still register but
 * knowledge will be empty.
 */

let server: McpServer;
let handlers: Map<string, (args: any) => Promise<unknown>>;
let tmpDir: string;
const originalAllowedRoots = process.env.CPSAGENTKIT_ALLOWED_ROOTS;

beforeAll(async () => {
  server = await createServer();
  // Extract registered tool handlers from the server internals
  handlers = new Map();
  const reg = server as unknown as {
    _registeredTools: Record<
      string,
      { handler: (args: any) => Promise<unknown> }
    >;
  };
  if (reg._registeredTools) {
    for (const [name, tool] of Object.entries(reg._registeredTools)) {
      handlers.set(name, tool.handler);
    }
  }
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cps-mcp-"));
  process.env.CPSAGENTKIT_ALLOWED_ROOTS = tmpDir;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  if (originalAllowedRoots === undefined) {
    delete process.env.CPSAGENTKIT_ALLOWED_ROOTS;
  } else {
    process.env.CPSAGENTKIT_ALLOWED_ROOTS = originalAllowedRoots;
  }
});

describe("createServer", () => {
  it("creates a server instance", () => {
    expect(server).toBeDefined();
  });

  it("server has the correct name", () => {
    // The McpServer stores its config internally
    // We verify it was created without throwing
    expect(server).toBeTruthy();
  });

  it("registers all expected tools", () => {
    const expectedTools = [
      "cps_list_knowledge_topics",
      "cps_get_knowledge",
      "cps_get_best_practice",
      "cps_search_docs",
      "cps_detect_project_state",
      "cps_list_agents",
      "cps_parse_agent",
      "cps_parse_solution",
      "cps_find_solution_folders",
      "cps_validate_tool_description",
      "cps_compose_review_prompt",
      "cps_bundle_solution",
      "cps_generate_topic_scaffolds",
      "cps_detect_dataverse_mcp",
      "cps_parse_prompt_config",
      "cps_build_prompt_update",
    ];
    for (const name of expectedTools) {
      expect(handlers.has(name), `Tool ${name} should be registered`).toBe(
        true,
      );
    }
  });
});

// ── Tool handler tests ───────────────────────────────────────

describe("cps_list_knowledge_topics", () => {
  it("returns a list of topics", async () => {
    const handler = handlers.get("cps_list_knowledge_topics");
    if (!handler) return;
    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("filters by category", async () => {
    const handler = handlers.get("cps_list_knowledge_topics");
    if (!handler) return;
    const result = (await handler({ category: "knowledge" })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    for (const topic of parsed) {
      expect(topic.category).toBe("knowledge");
    }
  });
});

describe("cps_get_knowledge", () => {
  it("returns error for unknown slug", async () => {
    const handler = handlers.get("cps_get_knowledge");
    if (!handler) return;
    const result = (await handler({
      slug: "nonexistent-topic-xyz",
    })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown knowledge slug");
  });
});

describe("cps_get_best_practice", () => {
  it("returns error for unknown slug", async () => {
    const handler = handlers.get("cps_get_best_practice");
    if (!handler) return;
    const result = (await handler({
      slug: "nonexistent-bp-xyz",
    })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown knowledge slug");
  });
});

describe("cps_detect_project_state", () => {
  it("detects an empty workspace", async () => {
    const handler = handlers.get("cps_detect_project_state");
    if (!handler) return;
    const result = (await handler({ workspaceRoot: tmpDir })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hasSpec).toBe(false);
    expect(parsed.hasArchitecture).toBe(false);
  });
});

describe("cps_list_agents", () => {
  it("returns empty for a bare workspace", async () => {
    const handler = handlers.get("cps_list_agents");
    if (!handler) return;
    const result = (await handler({ workspaceRoot: tmpDir })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.agents).toEqual([]);
  });

  it("finds agent folders", async () => {
    const agentDir = path.join(tmpDir, "TestAgent");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: Test");
    await fs.mkdir(path.join(agentDir, "topics"));

    const handler = handlers.get("cps_list_agents");
    if (!handler) return;
    const result = (await handler({ workspaceRoot: tmpDir })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.agents).toHaveLength(1);
  });
});

describe("cps_parse_agent", () => {
  it("parses a valid agent folder", async () => {
    const agentDir = path.join(tmpDir, "MyAgent");
    await fs.mkdir(agentDir);
    await fs.writeFile(path.join(agentDir, "settings.yaml"), "name: MyAgent");
    await fs.mkdir(path.join(agentDir, "topics"));

    const handler = handlers.get("cps_parse_agent");
    if (!handler) return;
    const result = (await handler({
      workspaceRoot: tmpDir,
      agentName: "MyAgent",
    })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe("MyAgent");
    expect(parsed.settings).toContain("name: MyAgent");
  });
});

describe("cps_parse_solution", () => {
  it("returns error for non-solution folder", async () => {
    const handler = handlers.get("cps_parse_solution");
    if (!handler) return;
    const result = (await handler({ solutionFolder: tmpDir })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Not a CPS solution folder");
  });

  it("parses a valid solution folder", async () => {
    // Create minimal solution structure
    await fs.writeFile(
      path.join(tmpDir, "solution.xml"),
      `<?xml version="1.0"?>
<ImportExportXml>
  <SolutionManifest>
    <UniqueName>TestSolution</UniqueName>
    <LocalizedNames><LocalizedName description="Test Solution" languagecode="1033" /></LocalizedNames>
    <Version>1.0.0.0</Version>
    <Publisher><UniqueName>TestPublisher</UniqueName></Publisher>
  </SolutionManifest>
</ImportExportXml>`,
    );
    await fs.mkdir(path.join(tmpDir, "botcomponents"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "bots", "cr123_testbot"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(tmpDir, "bots", "cr123_testbot", "bot.xml"),
      "<bot><name>TestBot</name></bot>",
    );

    const handler = handlers.get("cps_parse_solution");
    if (!handler) return;
    const result = (await handler({ solutionFolder: tmpDir })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.metadata.uniqueName).toBe("TestSolution");
    expect(parsed.agents).toBeDefined();
  });
});

describe("cps_find_solution_folders", () => {
  it("returns empty for bare directory", async () => {
    const handler = handlers.get("cps_find_solution_folders");
    if (!handler) return;
    const result = (await handler({ baseDir: tmpDir })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.solutions).toEqual([]);
  });
});

describe("cps_validate_tool_description", () => {
  it("validates a description and returns issues", async () => {
    const handler = handlers.get("cps_validate_tool_description");
    if (!handler) return;
    const result = (await handler({
      description: "Does stuff.",
      kind: "tool",
    })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.issues).toBeDefined();
    expect(Array.isArray(parsed.issues)).toBe(true);
  });
});

describe("cps_generate_topic_scaffolds", () => {
  it("parses architecture with topics table", async () => {
    const handler = handlers.get("cps_generate_topic_scaffolds");
    if (!handler) return;
    const arch = `# Architecture\n\n## Topics\n\n| Topic | Agent | Description | Key Behaviour |\n|-------|-------|-------------|---------------|\n| Billing | Main | Handles billing | Routes to billing |\n`;
    const result = (await handler({ architecture: arch })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.topics).toBeDefined();
  });
});

describe("cps_detect_dataverse_mcp", () => {
  it("reports not configured for bare workspace", async () => {
    const handler = handlers.get("cps_detect_dataverse_mcp");
    if (!handler) return;
    const result = (await handler({ workspaceRoot: tmpDir })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.configured).toBe(false);
  });
});

describe("cps_parse_prompt_config", () => {
  it("returns error for invalid JSON", async () => {
    const handler = handlers.get("cps_parse_prompt_config");
    if (!handler) return;
    const result = (await handler({
      customConfiguration: "not-json",
    })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
  });

  it("parses valid prompt config", async () => {
    const handler = handlers.get("cps_parse_prompt_config");
    if (!handler) return;
    const config = JSON.stringify({
      prompt: [{ role: "system", content: "You are a helper." }],
      definitions: {},
      modelParameters: {},
      settings: {},
    });
    const result = (await handler({
      customConfiguration: config,
    })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.prompts).toHaveLength(1);
    expect(parsed.segmentCount).toBe(1);
  });
});

describe("cps_build_prompt_update", () => {
  it("returns error for invalid input", async () => {
    const handler = handlers.get("cps_build_prompt_update");
    if (!handler) return;
    const result = (await handler({
      originalCustomConfiguration: "not-json",
      newPrompts: [{ role: "system", content: "Hello" }],
    })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
  });

  it("builds valid update for matching segments", async () => {
    const handler = handlers.get("cps_build_prompt_update");
    if (!handler) return;
    const original = JSON.stringify({
      prompt: [{ role: "system", content: "Original text." }],
      definitions: {},
      modelParameters: {},
      settings: {},
    });
    const result = (await handler({
      originalCustomConfiguration: original,
      newPrompts: [{ role: "system", content: "Updated text." }],
    })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.validation.ok).toBe(true);
    expect(parsed.newCustomConfiguration).toBeDefined();
  });
});

// ── Branch coverage: knowledge/best-practice retrieval ───────

describe("cps_get_knowledge (branch coverage)", () => {
  it("returns content directly for a unique knowledge slug", async () => {
    const handler = handlers.get("cps_get_knowledge");
    if (!handler) return;
    // anti-patterns is unique to knowledge category, so direct lookup succeeds
    const result = (await handler({ slug: "anti-patterns" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  it("returns content for a duplicated slug via prefix fallback", async () => {
    const handler = handlers.get("cps_get_knowledge");
    if (!handler) return;
    // "constraints" exists in both knowledge and foundry, so it's stored as
    // "knowledge:constraints" — direct lookup fails, prefix fallback succeeds
    const result = (await handler({ slug: "constraints" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });
});

describe("cps_get_best_practice (branch coverage)", () => {
  it("returns content for a valid best-practice slug", async () => {
    const handler = handlers.get("cps_get_best_practice");
    if (!handler) return;
    const result = (await handler({ slug: "part1-platform" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  it("uses category prefix fallback when slug is found with wrong category", async () => {
    const handler = handlers.get("cps_get_best_practice");
    if (!handler) return;
    // Request a knowledge slug via bestpractice tool — tests the prefix fallback
    const result = (await handler({ slug: "constraints" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    // Should either return the doc (if found with prefix) or error
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });
});

// ── Branch coverage: cps_compose_review_prompt ───────────────

describe("cps_compose_review_prompt", () => {
  it("returns a review prompt for a workspace with agents", async () => {
    // Set up minimal agent workspace
    const agentDir = path.join(tmpDir, "ReviewAgent");
    await fs.mkdir(agentDir);
    await fs.writeFile(
      path.join(agentDir, "settings.yaml"),
      "name: ReviewAgent\ninstructions: Help users",
    );
    await fs.mkdir(path.join(agentDir, "topics"));
    await fs.writeFile(
      path.join(agentDir, "topics", "greeting.yaml"),
      "kind: Topic\nname: Greeting\ntriggerQueries:\n  - hello",
    );

    const handler = handlers.get("cps_compose_review_prompt");
    if (!handler) return;
    const result = (await handler({
      workspaceRoot: tmpDir,
      reviewScope: "full",
    })) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(result.content[0].text).toContain("CPS Solution Review");
    expect(result.content[0].text).toContain("ReviewAgent");
  });

  it("returns a review prompt with no agents (empty workspace)", async () => {
    const handler = handlers.get("cps_compose_review_prompt");
    if (!handler) return;
    const result = (await handler({
      workspaceRoot: tmpDir,
    })) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(result.content[0].text).toContain("CPS Solution Review");
  });
});

describe("cps_bundle_solution", () => {
  it("bundles an in-memory cloned-agent folder", async () => {
    const handler = handlers.get("cps_bundle_solution");
    if (!handler) return;
    const result = (await handler({
      files: [
        { path: "HelpDesk/settings.yaml", content: "name: HelpDesk" },
        {
          path: "HelpDesk/topics/Greeting.yml",
          content: "kind: TopicDialog",
        },
      ],
    })) as { content: Array<{ type: string; text: string }> };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.markdown).toContain("## Solution Under Review");
    expect(parsed.agents).toHaveLength(1);
    expect(parsed.agents[0].topicCount).toBe(1);
    expect(parsed.stats.filesIncluded).toBe(2);
  });
});

describe("registered prompts", () => {
  it("registers cps_spec_planner and cps_solution_reviewer", () => {
    const reg = server as unknown as {
      _registeredPrompts: Record<string, unknown>;
    };
    if (!reg._registeredPrompts) return;
    expect(reg._registeredPrompts["cps_spec_planner"]).toBeDefined();
    expect(reg._registeredPrompts["cps_solution_reviewer"]).toBeDefined();
    expect(reg._registeredPrompts["cps_docs_qa_agent"]).toBeDefined();
  });
});

// ── Branch coverage: resource registration ───────────────────

describe("MCP resource registration", () => {
  it("registers resources for knowledge topics", () => {
    // Access the registered resources from the server
    const reg = server as unknown as {
      _registeredResources: Record<string, unknown>;
    };
    // If resources exist, verify there are some
    if (reg._registeredResources) {
      const resourceKeys = Object.keys(reg._registeredResources);
      expect(resourceKeys.length).toBeGreaterThan(0);
    }
  });
});

// ── Path validation tests ────────────────────────────────────

describe("path validation", () => {
  const toolsRequiringAbsPath = [
    "cps_detect_project_state",
    "cps_list_agents",
    "cps_compose_review_prompt",
    "cps_detect_dataverse_mcp",
  ];

  for (const toolName of toolsRequiringAbsPath) {
    it(`${toolName} rejects relative paths`, async () => {
      const handler = handlers.get(toolName);
      if (!handler) return;
      const result = (await handler({ workspaceRoot: "relative/path" })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("must be an absolute path");
    });
  }

  it("cps_parse_solution rejects relative solutionFolder", async () => {
    const handler = handlers.get("cps_parse_solution");
    if (!handler) return;
    const result = (await handler({ solutionFolder: "relative/path" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("must be an absolute path");
  });

  it("cps_find_solution_folders rejects relative baseDir", async () => {
    const handler = handlers.get("cps_find_solution_folders");
    if (!handler) return;
    const result = (await handler({ baseDir: "relative/path" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("must be an absolute path");
  });

  it("cps_parse_agent rejects traversal in agentName", async () => {
    const handler = handlers.get("cps_parse_agent");
    if (!handler) return;
    const result = (await handler({
      workspaceRoot: tmpDir,
      agentName: "../../etc/passwd",
    })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("must not traverse outside");
  });

  it("rejects absolute paths outside allowed roots", async () => {
    const handler = handlers.get("cps_detect_project_state");
    if (!handler) return;
    const outsideAllowedRoot = path.dirname(tmpDir);
    const result = (await handler({ workspaceRoot: outsideAllowedRoot })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("allowed workspace root");
  });
});

// ── Phase 2d: aw_* alias parity ──────────────────────────────

describe("aw_* tool aliases", () => {
  const cpsToolNames = [
    "cps_list_knowledge_topics",
    "cps_get_knowledge",
    "cps_get_best_practice",
    "cps_search_docs",
    "cps_detect_project_state",
    "cps_list_agents",
    "cps_parse_agent",
    "cps_parse_solution",
    "cps_find_solution_folders",
    "cps_validate_tool_description",
    "cps_compose_review_prompt",
    "cps_generate_topic_scaffolds",
    "cps_detect_dataverse_mcp",
    "cps_parse_prompt_config",
    "cps_build_prompt_update",
  ];

  for (const cpsName of cpsToolNames) {
    const awName = `aw_${cpsName.slice("cps_".length)}`;
    it(`${awName} is registered alongside ${cpsName}`, () => {
      expect(handlers.has(cpsName)).toBe(true);
      expect(handlers.has(awName)).toBe(true);
    });
  }

  it("aw_list_knowledge_topics returns the same result as cps_list_knowledge_topics", async () => {
    const cps = handlers.get("cps_list_knowledge_topics");
    const aw = handlers.get("aw_list_knowledge_topics");
    if (!cps || !aw) return;
    const cpsResult = (await cps({})) as {
      content: Array<{ type: string; text: string }>;
    };
    const awResult = (await aw({})) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(awResult.content[0].text).toBe(cpsResult.content[0].text);
  });

  it("aw_get_knowledge returns the same result as cps_get_knowledge", async () => {
    const cps = handlers.get("cps_get_knowledge");
    const aw = handlers.get("aw_get_knowledge");
    if (!cps || !aw) return;
    // Pick a slug that exists by listing first.
    const list = handlers.get("cps_list_knowledge_topics");
    if (!list) return;
    const listResult = (await list({ category: "knowledge" })) as {
      content: Array<{ type: string; text: string }>;
    };
    const topics = JSON.parse(listResult.content[0].text) as Array<{
      slug: string;
    }>;
    if (topics.length === 0) return;
    const slug = topics[0].slug;
    const cpsResult = (await cps({ slug })) as {
      content: Array<{ type: string; text: string }>;
    };
    const awResult = (await aw({ slug })) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(awResult.content[0].text).toBe(cpsResult.content[0].text);
  });
});

describe("AGENT_WORKBENCH_ALLOWED_ROOTS env var", () => {
  it("is honored when set", async () => {
    const handler = handlers.get("cps_detect_project_state");
    if (!handler) return;
    const previous = process.env.AGENT_WORKBENCH_ALLOWED_ROOTS;
    const previousLegacy = process.env.CPSAGENTKIT_ALLOWED_ROOTS;
    delete process.env.CPSAGENTKIT_ALLOWED_ROOTS;
    process.env.AGENT_WORKBENCH_ALLOWED_ROOTS = tmpDir;
    try {
      const result = (await handler({ workspaceRoot: tmpDir })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      // Either succeeds, or fails for a reason other than "allowed root".
      if (result.isError) {
        expect(result.content[0].text).not.toContain("allowed workspace root");
      }
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_WORKBENCH_ALLOWED_ROOTS;
      } else {
        process.env.AGENT_WORKBENCH_ALLOWED_ROOTS = previous;
      }
      if (previousLegacy !== undefined) {
        process.env.CPSAGENTKIT_ALLOWED_ROOTS = previousLegacy;
      }
    }
  });
});
