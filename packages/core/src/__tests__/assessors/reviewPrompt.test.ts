import { describe, it, expect } from "vitest";
import { composeReviewPrompt } from "../../assessors/reviewPrompt.js";
import type { AgentSnapshot } from "../../types/index.js";

const makeAgent = (overrides: Partial<AgentSnapshot> = {}): AgentSnapshot => ({
  name: "TestAgent",
  settings: "key: value",
  agentConfig: "",
  connectionReferences: "",
  topics: [],
  actions: [],
  knowledge: [],
  ...overrides,
});

const KNOWLEDGE_RULES = [
  { filename: "constraints.md", content: "# Constraints\n\nMax 25 tools." },
  {
    filename: "anti-patterns.md",
    content: "# Anti-Patterns\n\nDon't do this.",
  },
];

const REQUIREMENTS = {
  spec: "# Spec\n\n## Purpose\n\nThis is a billing support agent that helps customers with invoice questions and payment processing.",
  architecture:
    "# Architecture\n\n## Overview\n\nSingle agent handling billing queries.\n\n## Agents\n\n### BillingAgent\n\n**Role:** Handles billing and invoicing.\n\n## Tools & Connectors\n\n| Tool | Owner Agent | Purpose | Manual Portal Step Required |\n|------|-------------|---------|----------------------------|\n| GetInvoice | BillingAgent | Retrieves invoice details from Dataverse | No |\n| ProcessPayment | BillingAgent | Processes credit card payments | Yes |",
  docs: [{ filename: "ref.md", content: "# Reference doc" }],
};

const BEST_PRACTICES = [
  { filename: "part1-platform.md", content: "# Platform\n\nBest practices." },
];

describe("composeReviewPrompt", () => {
  it("produces a non-empty markdown string", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result.length).toBeGreaterThan(0);
    expect(typeof result).toBe("string");
  });

  it("includes CPS Solution Review header", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("# CPS Solution Review");
  });

  it("includes the agent name", () => {
    const result = composeReviewPrompt(
      [makeAgent({ name: "BillingBot" })],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("### Agent: BillingBot");
  });

  it("includes spec and architecture from requirements", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("## Spec");
    expect(result).toContain("billing support agent");
    expect(result).toContain("## Architecture");
  });

  it("includes knowledge rules", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("Max 25 tools");
    expect(result).toContain("Don't do this");
  });

  it("includes best practices", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("Additional Best Practices");
    expect(result).toContain("Best practices.");
  });

  it("includes requirements docs", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("## Requirements Docs");
    expect(result).toContain("# Reference doc");
  });

  it("skips spec section when spec is template-only", () => {
    const reqs = {
      ...REQUIREMENTS,
      spec: "# Spec\n## Purpose\n<!-- One paragraph -->\n-",
    };
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      reqs,
      BEST_PRACTICES,
      "full",
    );
    expect(result).not.toContain("## Spec\n\n# Spec");
  });

  it("includes review scope in output", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "descriptions",
    );
    expect(result).toContain("descriptions");
  });

  // ── Review scope variations ──

  it("includes full scope instructions", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("comprehensive review");
  });

  it("includes prompts scope instructions", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "prompts",
    );
    expect(result).toContain("agent instructions and topic-level prompts");
  });

  it("includes descriptions scope instructions", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "descriptions",
    );
    expect(result).toContain("topic trigger descriptions");
  });

  it("includes architecture scope instructions", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "architecture",
    );
    expect(result).toContain("multi-agent architecture");
  });

  // ── Agent content sections ──

  it("includes topics when present", () => {
    const result = composeReviewPrompt(
      [
        makeAgent({
          topics: [{ filename: "billing.yaml", content: "trigger: billing" }],
        }),
      ],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("#### topics");
    expect(result).toContain("**billing.yaml**");
  });

  it("includes actions when present", () => {
    const result = composeReviewPrompt(
      [
        makeAgent({
          actions: [{ filename: "search.yaml", content: "kind: action" }],
        }),
      ],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("#### actions");
    expect(result).toContain("**search.yaml**");
  });

  it("includes connection references when present", () => {
    const result = composeReviewPrompt(
      [makeAgent({ connectionReferences: "ref: conn-123" })],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("#### connection references");
  });

  it("includes Connector Action Input Audit section", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("## Connector Action Input Audit");
  });

  it("includes document manifest appendix", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("Appendix: Documents Used");
    expect(result).toContain("Requirements/spec.md");
    expect(result).toContain("Requirements/docs/ref.md");
  });

  it("includes connector naming mismatch section when architecture exists", () => {
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("Deterministic Connector Naming Check");
    expect(result).toContain("Curated Standard Connector Actions");
  });

  it("reports no mismatches when tools use non-catalog names", () => {
    const reqs = {
      ...REQUIREMENTS,
      architecture:
        "# Architecture\n\n## Overview\n\nSingle agent with a custom tool.\n\n## Tools & Connectors\n\n| Tool | Owner Agent | Purpose | Manual Portal Step Required |\n|------|-------------|---------|----------------------------|\n| Custom REST API | Agent | Calls internal API (v2) | No |",
    };
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      reqs,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("No connector naming mismatches were detected");
  });

  it("generates spec/arch templates when they are blank", () => {
    const reqs = { spec: "", architecture: "", docs: [] };
    const result = composeReviewPrompt(
      [makeAgent()],
      KNOWLEDGE_RULES,
      reqs,
      [],
      "full",
    );
    expect(result).toContain("Spec template");
    expect(result).toContain("Architecture template");
  });

  it("handles multiple agents", () => {
    const result = composeReviewPrompt(
      [makeAgent({ name: "Agent1" }), makeAgent({ name: "Agent2" })],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("### Agent: Agent1");
    expect(result).toContain("### Agent: Agent2");
  });

  // ── Branch coverage: agentConfig and knowledge sections ──

  it("includes agentConfig section when populated", () => {
    const result = composeReviewPrompt(
      [makeAgent({ agentConfig: "modelConfig:\n  temperature: 0.7" })],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("#### agent config");
    expect(result).toContain("temperature: 0.7");
  });

  it("includes knowledge section when populated", () => {
    const result = composeReviewPrompt(
      [
        makeAgent({
          knowledge: [
            { filename: "faq.md", content: "# FAQ\n\nHow do I reset?" },
            { filename: "config.yaml", content: "source: sharepoint" },
          ],
        }),
      ],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).toContain("#### knowledge");
    expect(result).toContain("**faq.md**");
    expect(result).toContain("```markdown");
    expect(result).toContain("**config.yaml**");
    expect(result).toContain("How do I reset?");
  });

  it("omits agentConfig section when empty", () => {
    const result = composeReviewPrompt(
      [makeAgent({ agentConfig: "" })],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).not.toContain("#### agent config");
  });

  it("omits knowledge section when empty array", () => {
    const result = composeReviewPrompt(
      [makeAgent({ knowledge: [] })],
      KNOWLEDGE_RULES,
      REQUIREMENTS,
      BEST_PRACTICES,
      "full",
    );
    expect(result).not.toContain("#### knowledge");
  });
});
