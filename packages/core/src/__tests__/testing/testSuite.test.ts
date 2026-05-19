import { describe, expect, it } from "vitest";
import { parseTestSuite, parseRubric } from "../../testing/testSuite.js";

const minimalSuite = {
  schemaVersion: "1.0",
  status: "reviewed",
  agent: {
    displayName: "X",
    agentFolder: "x",
    botSchemaName: "cr_x",
  },
  scenarios: [
    {
      id: "a",
      title: "A",
      turns: [{ user: "hi" }],
    },
  ],
};

describe("parseTestSuite", () => {
  it("parses a minimal suite", () => {
    const result = parseTestSuite(minimalSuite);
    expect(result.value.scenarios).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it("warns when status is draft", () => {
    const result = parseTestSuite({ ...minimalSuite, status: "draft" });
    expect(result.value.status).toBe("draft");
    expect(result.warnings.some((w) => w.toLowerCase().includes("draft"))).toBe(
      true,
    );
  });

  it("rejects unknown major schemaVersion", () => {
    expect(() =>
      parseTestSuite({ ...minimalSuite, schemaVersion: "2.0" }),
    ).toThrow(/unsupported/i);
  });

  it("tolerates unknown minor schemaVersion with warning", () => {
    const result = parseTestSuite({ ...minimalSuite, schemaVersion: "1.7" });
    expect(
      result.warnings.some((w) => w.includes("1.7") || w.includes("minor 7")),
    ).toBe(true);
  });

  it("rejects duplicate scenario ids", () => {
    expect(() =>
      parseTestSuite({
        ...minimalSuite,
        scenarios: [
          { id: "x", title: "X", turns: [{ user: "a" }] },
          { id: "x", title: "X", turns: [{ user: "b" }] },
        ],
      }),
    ).toThrow(/duplicate/i);
  });

  it("rejects invalid regex in mustMatch", () => {
    expect(() =>
      parseTestSuite({
        ...minimalSuite,
        scenarios: [
          {
            id: "a",
            title: "A",
            turns: [{ user: "x" }],
            expected: { mustMatch: ["(unclosed"] },
          },
        ],
      }),
    ).toThrow(/invalid regex/i);
  });
});

describe("parseRubric", () => {
  it("parses a valid rubric", () => {
    const r = parseRubric({
      schemaVersion: "1.0",
      criteria: [{ id: "c", label: "C", scale: "1-5", description: "d" }],
    });
    expect(r.value.criteria).toHaveLength(1);
  });

  it("rejects an empty rubric", () => {
    expect(() => parseRubric({ schemaVersion: "1.0", criteria: [] })).toThrow();
  });
});
