// Parse a plain-text prompts file into a TestSuite. One non-blank, non-comment
// line per scenario; each scenario is a single user turn against a fresh
// conversation. Mirrors the loadPrompts() ergonomics from scripts/chat.mjs,
// minus group / [CHOOSE] / [EXPECT] support (those come in later passes).
import type { TestAgentTarget, TestSuite, TestSuiteDefaults } from "./types.js";

export interface TextPromptsParseOptions {
  agent: TestAgentTarget;
  defaults?: TestSuiteDefaults;
}

const TITLE_MAX = 80;

export function parseTextPromptsSuite(
  text: string,
  opts: TextPromptsParseOptions,
): TestSuite {
  const prompts: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    prompts.push(line);
  }

  const idWidth = Math.max(3, String(prompts.length).length);
  const scenarios: TestSuite["scenarios"] = prompts.map((prompt, i) => ({
    id: `prompt-${String(i + 1).padStart(idWidth, "0")}`,
    title: truncate(prompt, TITLE_MAX),
    category: "prompts-txt",
    turns: [{ user: prompt }],
  }));

  return {
    schemaVersion: "1.0",
    status: "reviewed",
    agent: opts.agent,
    defaults: opts.defaults ?? {
      freshConversationPerScenario: true,
      maxTurns: 1,
      timeoutMs: 60_000,
      maxParallelScenarios: 4,
    },
    scenarios,
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
