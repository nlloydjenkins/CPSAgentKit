import { describe, expect, it } from "vitest";
import {
  renderMarkdown,
  buildTimestampFolder,
} from "../../testing/reportWriter.js";
import type { TestRunResult } from "../../testing/types.js";

const run: TestRunResult = {
  schemaVersion: "1.0",
  runId: "20260518T120000Z",
  startedAt: "2026-05-18T12:00:00.000Z",
  completedAt: "2026-05-18T12:00:30.000Z",
  agent: { displayName: "X", agentFolder: "x", botSchemaName: "cr_x" },
  summary: { total: 2, passed: 1, failed: 1, inconclusive: 0, errored: 0 },
  scenarios: [
    {
      id: "pass",
      title: "Pass",
      status: "passed",
      durationMs: 100,
      finalResponse: "Hello",
      deterministic: { status: "passed", checks: [] },
      activityFile: "activities/pass.json",
      errors: [],
    },
    {
      id: "fail",
      title: "Fail",
      status: "failed",
      durationMs: 200,
      finalResponse: "Oops",
      deterministic: {
        status: "failed",
        checks: [
          {
            name: "mustContain",
            status: "failed",
            detail: 'Missing substrings: "expected"',
          },
        ],
      },
      activityFile: "activities/fail.json",
      errors: [],
    },
  ],
};

describe("renderMarkdown", () => {
  it("includes summary table and groups failed first", () => {
    const md = renderMarkdown(run);
    expect(md).toContain("# Agent test report");
    expect(md).toContain("## Summary");
    expect(md.indexOf("Failed scenarios")).toBeLessThan(
      md.indexOf("Passed scenarios"),
    );
    expect(md).toContain("activities/fail.json");
  });

  it("includes warnings section when present", () => {
    const md = renderMarkdown(run, ["status is draft"]);
    expect(md).toContain("## Warnings");
    expect(md).toContain("status is draft");
  });
});

describe("buildTimestampFolder", () => {
  it("produces a Windows-safe colon-stripped UTC stamp", () => {
    const stamp = buildTimestampFolder(
      new Date(Date.UTC(2026, 4, 18, 15, 30, 5)),
    );
    expect(stamp).toBe("20260518T153005Z");
  });
});
