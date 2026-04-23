/**
 * Rule-based validator for CPS tool / topic / action descriptions.
 *
 * Based on `.cpsagentkit/knowledge/tool-descriptions.md`:
 *  - Descriptions are the primary routing signal in generative orchestration
 *  - They should say WHAT the tool does, WHEN to call it, what inputs it
 *    expects, and what it does NOT do
 *  - Vague verbs and generic domain nouns cause misrouting
 *  - Length sweet spot: ~60–1000 characters
 */
import type { ToolDescriptionValidation } from "../types/index.js";

const MIN_LENGTH = 60;
const MAX_LENGTH = 1000;
const MIN_WORDS = 10;

const VAGUE_OPENERS = [
  /^helps?\b/i,
  /^handles?\b/i,
  /^manages?\b/i,
  /^provides?\b/i,
  /^deals\s+with\b/i,
  /^assists?\b/i,
  /^supports?\b/i,
  /^works?\s+with\b/i,
];

const WHEN_KEYWORDS = [
  "when",
  "use this",
  "call this",
  "trigger",
  "if the user",
  "for questions about",
  "for requests",
];

const WHAT_KEYWORDS = [
  "returns",
  "retrieves",
  "creates",
  "updates",
  "deletes",
  "looks up",
  "searches",
  "fetches",
  "answers",
  "generates",
  "calculates",
  "validates",
  "analyses",
  "analyzes",
  "sends",
  "lists",
];

const NEGATIVE_KEYWORDS = [
  "do not use",
  "don't use",
  "does not",
  "is not for",
  "not for",
  "exclude",
  "except",
];

const INPUT_KEYWORDS = [
  "input",
  "parameter",
  "takes",
  "requires",
  "expects",
  "given",
  "with the",
];

function countMatches(text: string, needles: string[]): number {
  const lower = text.toLowerCase();
  return needles.reduce((n, needle) => (lower.includes(needle) ? n + 1 : n), 0);
}

/**
 * Validate a description string and return structured feedback. Non-strict:
 * returns all findings so the caller can decide severity threshold.
 */
export function validateToolDescription(
  description: string,
  kind: "tool" | "topic" | "agent" = "tool",
): ToolDescriptionValidation {
  const issues: ToolDescriptionValidation["issues"] = [];
  const suggestions: string[] = [];

  const trimmed = description.trim();
  const length = trimmed.length;
  const words = trimmed.split(/\s+/).filter(Boolean);

  if (!trimmed) {
    issues.push({
      severity: "error",
      message: `Empty ${kind} description — orchestrator cannot route to this ${kind}.`,
    });
    return {
      ok: false,
      length: 0,
      wordCount: 0,
      issues,
      suggestions: [
        "Write one or two sentences that say what the tool does, when to call it, and what it expects as input.",
      ],
    };
  }

  if (length < MIN_LENGTH) {
    issues.push({
      severity: "warning",
      message: `Description is very short (${length} chars). Orchestrator routing degrades below ~${MIN_LENGTH} chars.`,
    });
    suggestions.push(
      "Add a sentence covering when to call this and what it returns.",
    );
  }

  if (length > MAX_LENGTH) {
    issues.push({
      severity: "warning",
      message: `Description is long (${length} chars). Keep descriptions under ~${MAX_LENGTH} chars to stay within orchestrator token budget.`,
    });
    suggestions.push(
      "Move background context into the agent instructions or knowledge base and keep the description focused on routing signals.",
    );
  }

  if (words.length < MIN_WORDS) {
    issues.push({
      severity: "warning",
      message: `Only ${words.length} words. Needs to convey purpose, trigger conditions, and expected inputs.`,
    });
  }

  // Vague opener
  if (VAGUE_OPENERS.some((re) => re.test(trimmed))) {
    issues.push({
      severity: "warning",
      message:
        "Starts with a vague verb (helps / handles / manages / provides). Use a concrete action verb (retrieves, creates, answers, validates).",
    });
    suggestions.push(
      'Replace generic openers with a concrete verb, e.g. "Retrieves customer orders from Dataverse".',
    );
  }

  // Missing "when" cue
  if (countMatches(trimmed, WHEN_KEYWORDS) === 0) {
    issues.push({
      severity: "info",
      message:
        'No explicit "when to call" cue. Orchestrator may fail to route borderline queries.',
    });
    suggestions.push(
      'Add an explicit trigger phrase, e.g. "Use this when the user asks about ..."',
    );
  }

  // Missing "what" cue
  if (countMatches(trimmed, WHAT_KEYWORDS) === 0) {
    issues.push({
      severity: "info",
      message:
        "No concrete action verb detected (returns / retrieves / creates / answers / ...).",
    });
  }

  // Missing negative / boundary
  if (countMatches(trimmed, NEGATIVE_KEYWORDS) === 0 && kind !== "topic") {
    issues.push({
      severity: "info",
      message:
        "No boundary statement. Consider adding what this tool is NOT for to prevent the orchestrator picking it for off-scope queries.",
    });
    suggestions.push(
      'Add "Do not use this for ..." to block unwanted routing.',
    );
  }

  // Missing input hint for tools
  if (kind === "tool" && countMatches(trimmed, INPUT_KEYWORDS) === 0) {
    issues.push({
      severity: "info",
      message:
        "No input description. The orchestrator will have to infer input shape from parameter names only.",
    });
  }

  const hasBlocker = issues.some((i) => i.severity === "error");

  return {
    ok: !hasBlocker,
    length,
    wordCount: words.length,
    issues,
    suggestions,
  };
}
