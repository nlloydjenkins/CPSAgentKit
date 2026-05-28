import { describe, it, expect } from "vitest";
import {
  composeAgentBuilderReviewPrompt,
  composeAgentBuilderAuthoringPrompt,
  composeKnowledgeDocReviewPrompt,
} from "../../assessors/agentBuilderPrompts.js";
import { recommendBuilder as recommend } from "../../assessors/agentBuilderRecommender.js";

describe("recommendBuilder", () => {
  it("recommends Agent Builder for an instructions-only M365 use case", () => {
    const result = recommend({
      surfaces: ["m365Copilot"],
      knowledgeSources: ["sharepoint", "uploadedFiles"],
      audienceIsM365LicensedOnly: true,
    });
    expect(result.recommendation).toBe("agentBuilder");
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.signals.onlyAgentBuilderKnowledge).toBe(true);
    expect(result.signals.onlyM365Surface).toBe(true);
  });

  it("forces Copilot Studio when custom tools are needed", () => {
    const result = recommend({
      surfaces: ["m365Copilot"],
      knowledgeSources: ["sharepoint"],
      audienceIsM365LicensedOnly: true,
      needsCustomTools: true,
    });
    expect(result.recommendation).toBe("copilotStudio");
    expect(result.rationale.join(" ")).toMatch(/custom tools/i);
  });

  it("forces Copilot Studio for non-M365 surfaces", () => {
    const result = recommend({
      surfaces: ["teamsBot"],
      knowledgeSources: ["sharepoint"],
      audienceIsM365LicensedOnly: true,
    });
    expect(result.recommendation).toBe("copilotStudio");
    expect(result.rationale.join(" ")).toMatch(/outside M365 Copilot/i);
  });

  it("forces Copilot Studio when Dataverse / MCP / autonomous / multi-agent flagged", () => {
    for (const flag of [
      "needsDataverse",
      "needsMcp",
      "needsAutonomousActions",
      "needsMultiAgent",
      "needsPowerAutomateActions",
      "needsComplexTopics",
    ] as const) {
      const result = recommend({
        surfaces: ["m365Copilot"],
        knowledgeSources: ["sharepoint"],
        audienceIsM365LicensedOnly: true,
        [flag]: true,
      });
      expect(result.recommendation, `flag=${flag}`).toBe("copilotStudio");
    }
  });

  it("routes to declarativeAgentInCps when API plugins or ALM are needed on M365 surface", () => {
    const apiCase = recommend({
      surfaces: ["m365Copilot"],
      knowledgeSources: ["sharepoint"],
      audienceIsM365LicensedOnly: true,
      needsApiPlugins: true,
    });
    expect(apiCase.recommendation).toBe("declarativeAgentInCps");

    const almCase = recommend({
      surfaces: ["m365Copilot"],
      knowledgeSources: ["sharepoint"],
      audienceIsM365LicensedOnly: true,
      needsAlm: true,
    });
    expect(almCase.recommendation).toBe("declarativeAgentInCps");
  });

  it("falls back to Copilot Studio when knowledge sources are unsupported by Agent Builder", () => {
    const result = recommend({
      surfaces: ["m365Copilot"],
      knowledgeSources: ["sharepoint", "dataverse"],
      audienceIsM365LicensedOnly: true,
    });
    expect(result.recommendation).toBe("copilotStudio");
  });

  it("falls back to Copilot Studio when audience is not M365-licensed only", () => {
    const result = recommend({
      surfaces: ["m365Copilot"],
      knowledgeSources: ["sharepoint"],
      audienceIsM365LicensedOnly: false,
    });
    expect(result.recommendation).toBe("copilotStudio");
  });

  it("normalises empty input to safe defaults", () => {
    const result = recommend({});
    expect(result.recommendation).toBe("copilotStudio");
    expect(result.signals.surfaces).toEqual([]);
    expect(result.signals.knowledgeSources).toEqual([]);
  });
});

describe("composeAgentBuilderReviewPrompt", () => {
  it("returns the reviewer system prompt and wrapped user content", () => {
    const out = composeAgentBuilderReviewPrompt("You are a billing agent.");
    expect(out.systemPrompt).toMatch(/Agent Instruction Reviewer/);
    expect(out.userContent).toMatch(/INSTRUCTIONS TO REVIEW:/);
    expect(out.userContent).toMatch(/billing agent/);
  });

  it("throws on empty instructions", () => {
    expect(() => composeAgentBuilderReviewPrompt("   ")).toThrow();
  });
});

describe("composeAgentBuilderAuthoringPrompt", () => {
  it("returns the author system prompt and wrapped user content", () => {
    const out = composeAgentBuilderAuthoringPrompt(
      "HR FAQ agent grounded on the HR policy library.",
    );
    expect(out.systemPrompt).toMatch(/Agent Instruction Author/);
    expect(out.userContent).toMatch(/BRIEF OR DRAFT INSTRUCTIONS:/);
    expect(out.userContent).toMatch(/HR FAQ agent/);
  });

  it("throws on empty brief", () => {
    expect(() => composeAgentBuilderAuthoringPrompt("")).toThrow();
  });
});

describe("composeKnowledgeDocReviewPrompt", () => {
  it("returns the doc reviewer system prompt and wrapped user content", () => {
    const out = composeKnowledgeDocReviewPrompt({
      document:
        "# Expense policy\n\nReimbursements must be filed within 30 days.",
      filename: "expense-policy.md",
    });
    expect(out.systemPrompt).toMatch(/Knowledge Document Reviewer/);
    expect(out.userContent).toMatch(
      /DOCUMENT TO REVIEW \(filename: expense-policy\.md\):/,
    );
    expect(out.userContent).toMatch(/Reimbursements must be filed/);
  });

  it("omits filename header when none provided", () => {
    const out = composeKnowledgeDocReviewPrompt({ document: "some content" });
    expect(out.userContent).toMatch(/^DOCUMENT TO REVIEW:\n/);
  });

  it("throws on empty document", () => {
    expect(() =>
      composeKnowledgeDocReviewPrompt({ document: "   " }),
    ).toThrow();
  });
});
