import { describe, it, expect } from "vitest";
import {
  bundleInMemorySolution,
  classifyCpsFile,
  isClonedAgentFile,
  isSolutionFile,
} from "../../assessors/solutionBundle.js";

describe("classifyCpsFile", () => {
  it("recognises settings, agent config, and connection refs at any depth", () => {
    expect(classifyCpsFile("HelpDesk/settings.yaml").kind).toBe("settings");
    expect(classifyCpsFile("HelpDesk/settings.mcs.yml").kind).toBe("settings");
    expect(classifyCpsFile("HelpDesk/agent.mcs.yml").kind).toBe("agentConfig");
    expect(classifyCpsFile("HelpDesk/connectionreferences.mcs.yml").kind).toBe(
      "connectionReferences",
    );
  });

  it("classifies topic / action / knowledge buckets", () => {
    expect(classifyCpsFile("HelpDesk/topics/Greeting.yml").kind).toBe("topic");
    expect(classifyCpsFile("HelpDesk/actions/SendMail.mcs.yml").kind).toBe(
      "action",
    );
    expect(classifyCpsFile("HelpDesk/knowledge/policy.md").kind).toBe(
      "knowledge",
    );
  });

  it("uses the deepest bucket name so nested child-agent files attribute to the child", () => {
    const c = classifyCpsFile("Solution/agents/Specialist/topics/Triage.yml");
    expect(c.kind).toBe("topic");
    expect(c.agent).toBe("Solution/agents/Specialist");
  });

  it("recognises solution-export files", () => {
    expect(classifyCpsFile("solution.xml").kind).toBe("solutionXml");
    expect(
      classifyCpsFile("botcomponents/HelpDesk.topic.Greeting/botcomponent.xml")
        .kind,
    ).toBe("botComponent");
  });

  it("ignores unrelated files with a reason", () => {
    const c = classifyCpsFile("README.md");
    expect(c.kind).toBe("ignored");
    expect(c.reason).toBe("not-a-recognised-cps-file");
  });

  it("isClonedAgentFile / isSolutionFile mirror classification", () => {
    expect(isClonedAgentFile("HelpDesk/settings.yaml")).toBe(true);
    expect(isClonedAgentFile("solution.xml")).toBe(false);
    expect(isSolutionFile("solution.xml")).toBe(true);
    expect(isSolutionFile("HelpDesk/settings.yaml")).toBe(false);
  });
});

describe("bundleInMemorySolution", () => {
  const files = [
    { path: "HelpDesk/settings.yaml", content: "name: HelpDesk" },
    {
      path: "HelpDesk/agent.mcs.yml",
      content: "kind: AgentDialog\ninstructions: Be helpful",
    },
    {
      path: "HelpDesk/topics/Greeting.yml",
      content: "kind: TopicDialog\nname: Greeting",
    },
    {
      path: "HelpDesk/actions/SendMail.mcs.yml",
      content: "kind: TaskDialog\nmodelDisplayName: SendMail",
    },
    {
      path: "HelpDesk/knowledge/files/policy.mcs.yml",
      content: "kind: KnowledgeSource",
    },
    { path: "HelpDesk/README.md", content: "ignored" },
    { path: "image.png", content: "binary-blob" },
  ];

  it("groups files by agent and produces a markdown bundle", () => {
    const result = bundleInMemorySolution(files);
    expect(result.agents).toHaveLength(1);
    const agent = result.agents[0];
    expect(agent.name).toBe("HelpDesk");
    expect(agent.settings).toContain("name: HelpDesk");
    expect(agent.agentConfig).toContain("AgentDialog");
    expect(agent.topics).toHaveLength(1);
    expect(agent.actions).toHaveLength(1);
    expect(agent.knowledge).toHaveLength(1);
    expect(result.markdown).toContain("## Solution Under Review");
    expect(result.markdown).toContain("### Agent: HelpDesk");
    expect(result.markdown).toContain("Greeting.yml");
  });

  it("records dropped-file reasons in stats", () => {
    const result = bundleInMemorySolution(files);
    expect(result.stats.filesSkipped).toBeGreaterThanOrEqual(2);
    expect(
      Object.keys(result.stats.droppedReasons).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("truncates a single oversized file and reports it", () => {
    const big = "x".repeat(5000);
    const result = bundleInMemorySolution(
      [
        { path: "HelpDesk/settings.yaml", content: "name: HelpDesk" },
        { path: "HelpDesk/topics/Big.yml", content: big },
      ],
      { perFileMaxBytes: 1000 },
    );
    expect(result.stats.filesTruncated).toBe(1);
    expect(result.markdown).toContain("truncated by cps_bundle_solution");
  });

  it("stops including files when the total cap is exceeded", () => {
    const heavy = "y".repeat(800);
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      path: `HelpDesk/topics/T${i}.yml`,
      content: heavy,
    }));
    inputs.unshift({
      path: "HelpDesk/settings.yaml",
      content: "name: HelpDesk",
    });
    const result = bundleInMemorySolution(inputs, {
      totalMaxBytes: 2000,
      perFileMaxBytes: 1000,
    });
    expect(result.stats.totalTruncated).toBe(true);
    expect(result.stats.droppedReasons["total-cap-exceeded"]).toBeGreaterThan(
      0,
    );
  });

  it("drops solution-export files with a clear reason", () => {
    const result = bundleInMemorySolution([
      { path: "solution.xml", content: "<ImportExportXml/>" },
      {
        path: "botcomponents/Foo.topic.Bar/botcomponent.xml",
        content: "<botcomponent/>",
      },
    ]);
    expect(result.agents).toHaveLength(0);
    expect(
      result.stats.droppedReasons["solution-export-not-bundled:solutionXml"],
    ).toBe(1);
    expect(
      result.stats.droppedReasons["solution-export-not-bundled:botComponent"],
    ).toBe(1);
  });
});
