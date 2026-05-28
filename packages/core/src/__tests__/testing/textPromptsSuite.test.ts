import { describe, it, expect } from "vitest";
import { parseTextPromptsSuite } from "../../testing/textPromptsSuite.js";

const agent = {
  displayName: "Test agent",
  agentFolder: "agent-1",
  botSchemaName: "cr123_test",
};

describe("parseTextPromptsSuite", () => {
  it("ignores blank lines and # comments", () => {
    const text = [
      "# header comment",
      "",
      "What is your purpose?",
      "",
      "  ",
      "# inline comment",
      "Tell me about Helping Britain Prosper.",
    ].join("\n");

    const suite = parseTextPromptsSuite(text, { agent });
    expect(suite.scenarios).toHaveLength(2);
    expect(suite.scenarios[0].turns).toEqual([
      { user: "What is your purpose?" },
    ]);
    expect(suite.scenarios[1].turns[0].user).toMatch(/Helping Britain Prosper/);
  });

  it("assigns stable padded ids and reviewed status", () => {
    const text = "a\nb\nc";
    const suite = parseTextPromptsSuite(text, { agent });
    expect(suite.status).toBe("reviewed");
    expect(suite.scenarios.map((s) => s.id)).toEqual([
      "prompt-001",
      "prompt-002",
      "prompt-003",
    ]);
  });

  it("truncates long prompts in the title but keeps full text in the turn", () => {
    const long = "x".repeat(200);
    const suite = parseTextPromptsSuite(long, { agent });
    expect(suite.scenarios[0].title.length).toBeLessThanOrEqual(80);
    expect(suite.scenarios[0].turns[0].user).toBe(long);
  });

  it("produces an empty scenarios array for an empty file", () => {
    const suite = parseTextPromptsSuite("# only a comment\n\n", { agent });
    expect(suite.scenarios).toHaveLength(0);
  });

  it("propagates the agent target and uses single-turn defaults", () => {
    const suite = parseTextPromptsSuite("hello", { agent });
    expect(suite.agent).toEqual(agent);
    expect(suite.defaults?.maxTurns).toBe(1);
    expect(suite.defaults?.freshConversationPerScenario).toBe(true);
  });
});
