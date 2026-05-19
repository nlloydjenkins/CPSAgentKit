import { describe, expect, it } from "vitest";
import { evaluateDeterministic } from "../../testing/deterministicEvaluator.js";
import type { TestScenario } from "../../testing/types.js";

function scenario(expected: TestScenario["expected"]): TestScenario {
  return {
    id: "s",
    title: "S",
    turns: [{ user: "hi" }],
    expected,
  };
}

describe("evaluateDeterministic", () => {
  it("passes when all mustContain substrings present", () => {
    const r = evaluateDeterministic({
      scenario: scenario({ mustContain: ["risk", "disclosure"] }),
      finalResponse: "We flagged the missing Risk DISCLOSURE.",
      activities: [],
      turnCount: 1,
    });
    expect(r.status).toBe("passed");
  });

  it("fails when a mustContain substring is missing", () => {
    const r = evaluateDeterministic({
      scenario: scenario({ mustContain: ["risk", "guarantee"] }),
      finalResponse: "Risk only.",
      activities: [],
      turnCount: 1,
    });
    expect(r.status).toBe("failed");
    expect(
      r.checks.some((c) => c.name === "mustContain" && c.status === "failed"),
    ).toBe(true);
  });

  it("fails when a forbidden substring appears", () => {
    const r = evaluateDeterministic({
      scenario: scenario({ mustNotContain: ["guaranteed"] }),
      finalResponse: "Returns are guaranteed.",
      activities: [],
      turnCount: 1,
    });
    expect(r.status).toBe("failed");
  });

  it("fails when mustMatch regex does not match", () => {
    const r = evaluateDeterministic({
      scenario: scenario({ mustMatch: ["^Risk:"] }),
      finalResponse: "Risk: detected",
      activities: [],
      turnCount: 1,
    });
    expect(r.status).toBe("passed");
  });

  it("returns inconclusive when expectedToolNames asked but trace missing", () => {
    const r = evaluateDeterministic({
      scenario: scenario({ expectedToolNames: ["LookupCustomer"] }),
      finalResponse: "done",
      activities: [],
      turnCount: 1,
    });
    expect(r.checks.find((c) => c.name === "expectedToolNames")?.status).toBe(
      "inconclusive",
    );
  });

  it("flags maxTurns overflow", () => {
    const r = evaluateDeterministic({
      scenario: scenario(undefined),
      finalResponse: "ok",
      activities: [],
      turnCount: 10,
      maxTurns: 6,
    });
    expect(r.checks.find((c) => c.name === "maxTurns")?.status).toBe("failed");
  });

  it("fails when response is empty", () => {
    const r = evaluateDeterministic({
      scenario: scenario(undefined),
      finalResponse: "",
      activities: [],
      turnCount: 1,
    });
    expect(r.status).toBe("failed");
  });
});
