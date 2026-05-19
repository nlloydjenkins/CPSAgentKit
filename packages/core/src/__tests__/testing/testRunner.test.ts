import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { runTestSuite } from "../../testing/testRunner.js";
import type { TestSuite } from "../../testing/types.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cps-runner-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function suite(): TestSuite {
  return {
    schemaVersion: "1.0",
    status: "reviewed",
    agent: { displayName: "X", agentFolder: "x", botSchemaName: "cr_x" },
    defaults: { maxParallelScenarios: 2, maxTurns: 6, timeoutMs: 5000 },
    scenarios: [
      {
        id: "good",
        title: "Good",
        turns: [{ user: "hi" }],
        expected: { mustContain: ["hello"] },
      },
      {
        id: "bad",
        title: "Bad",
        turns: [{ user: "no" }],
        expected: { mustContain: ["impossible"] },
      },
    ],
  };
}

describe("runTestSuite", () => {
  it("classifies passed and failed scenarios using deterministic checks", async () => {
    const fetchImpl = createFakeFetch();
    const run = await runTestSuite({
      suite: suite(),
      directLine: {
        environmentHostname: "test.example.com",
        tokenProvider: async () => "fake-token",
      },
      fetchImpl,
      runDir: tmpDir,
    });

    expect(run.scenarios).toHaveLength(2);
    expect(run.summary.passed).toBe(1);
    expect(run.summary.failed).toBe(1);
    expect(run.scenarios.find((s) => s.id === "good")?.status).toBe("passed");
    expect(run.scenarios.find((s) => s.id === "bad")?.status).toBe("failed");

    // Activity file should exist on disk.
    const file = path.join(tmpDir, run.scenarios[0].activityFile);
    const text = await fs.readFile(file, "utf-8");
    expect(JSON.parse(text)).toBeInstanceOf(Array);
  });
});

function createFakeFetch(): typeof fetch {
  let convCount = 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (
      (init?.method ?? "GET") === "POST" &&
      !/\/conversations\/[^?]/.test(url)
    ) {
      convCount++;
      return new Response(
        JSON.stringify({ conversationId: `conv-${convCount}` }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({
        activities: [
          {
            type: "message",
            from: { role: "bot", name: "X" },
            text: "Hello there",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}
