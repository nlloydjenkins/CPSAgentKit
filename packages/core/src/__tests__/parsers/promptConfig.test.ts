import { describe, it, expect } from "vitest";
import {
  extractPlaceholders,
  parsePromptConfig,
  buildPromptUpdate,
} from "../../parsers/promptConfig.js";

// ── Fixtures ─────────────────────────────────────────────────

const VALID_CONFIG = JSON.stringify({
  prompt: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Answer about {{topic}} for {{user_name}}." },
  ],
  code: "generated-code",
  definitions: { inputs: {} },
  modelParameters: { model: "gpt-4o", temperature: 0.7 },
  settings: {},
  signature: "abc123",
});

// ── extractPlaceholders ──────────────────────────────────────

describe("extractPlaceholders", () => {
  it("returns empty array when no placeholders", () => {
    expect(extractPlaceholders("No placeholders here")).toEqual([]);
  });

  it("extracts a single placeholder", () => {
    expect(extractPlaceholders("Hello {{name}}!")).toEqual(["name"]);
  });

  it("extracts multiple placeholders sorted", () => {
    expect(
      extractPlaceholders("{{zebra}} and {{alpha}} and {{middle}}"),
    ).toEqual(["alpha", "middle", "zebra"]);
  });

  it("deduplicates repeated placeholders", () => {
    expect(extractPlaceholders("{{x}} then {{x}} again")).toEqual(["x"]);
  });

  it("handles placeholders with whitespace inside braces", () => {
    expect(extractPlaceholders("{{ spaced }}")).toEqual(["spaced"]);
  });

  it("handles underscored names", () => {
    expect(extractPlaceholders("{{user_name}}")).toEqual(["user_name"]);
  });

  it("ignores malformed braces", () => {
    expect(extractPlaceholders("{not_a_placeholder}")).toEqual([]);
    expect(extractPlaceholders("{{}}")).toEqual([]);
    expect(extractPlaceholders("{{ 123invalid }}")).toEqual([]);
  });

  it("handles empty string", () => {
    expect(extractPlaceholders("")).toEqual([]);
  });
});

// ── parsePromptConfig ────────────────────────────────────────

describe("parsePromptConfig", () => {
  it("parses a valid config", () => {
    const result = parsePromptConfig(VALID_CONFIG);
    expect(result.prompts).toHaveLength(2);
    expect(result.prompts[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant.",
    });
    expect(result.placeholders).toEqual(["topic", "user_name"]);
    expect(result.keys).toContain("prompt");
    expect(result.keys).toContain("code");
    expect(result.keys).toContain("signature");
  });

  it("throws on invalid JSON", () => {
    expect(() => parsePromptConfig("not json")).toThrow("not valid JSON");
  });

  it("throws on JSON array at top level", () => {
    expect(() => parsePromptConfig("[]")).toThrow("must be a JSON object");
  });

  it("throws on JSON string at top level", () => {
    expect(() => parsePromptConfig('"hello"')).toThrow("must be a JSON object");
  });

  it("throws when prompt key is not an array", () => {
    expect(() =>
      parsePromptConfig(JSON.stringify({ prompt: "not an array" })),
    ).toThrow("is not an array");
  });

  it("throws when a segment is missing role", () => {
    expect(() =>
      parsePromptConfig(JSON.stringify({ prompt: [{ content: "hello" }] })),
    ).toThrow("missing string `role` or `content`");
  });

  it("throws when a segment is missing content", () => {
    expect(() =>
      parsePromptConfig(JSON.stringify({ prompt: [{ role: "system" }] })),
    ).toThrow("missing string `role` or `content`");
  });

  it("throws when a segment is null", () => {
    expect(() => parsePromptConfig(JSON.stringify({ prompt: [null] }))).toThrow(
      "missing string `role` or `content`",
    );
  });

  it("handles config with no placeholders", () => {
    const config = JSON.stringify({
      prompt: [{ role: "system", content: "No placeholders." }],
    });
    const result = parsePromptConfig(config);
    expect(result.placeholders).toEqual([]);
  });
});

// ── buildPromptUpdate ────────────────────────────────────────

describe("buildPromptUpdate", () => {
  it("succeeds with content-only changes", () => {
    const result = buildPromptUpdate({
      originalCustomConfiguration: VALID_CONFIG,
      newPrompts: [
        { role: "system", content: "Updated system prompt." },
        {
          role: "user",
          content: "New question about {{topic}} for {{user_name}}.",
        },
      ],
    });
    expect(result.validation.ok).toBe(true);
    expect(result.validation.errors).toHaveLength(0);
    expect(result.newCustomConfiguration).toBeDefined();

    // Verify round-trip: non-prompt keys preserved
    const parsed = JSON.parse(result.newCustomConfiguration!);
    expect(parsed.code).toBe("generated-code");
    expect(parsed.signature).toBe("abc123");
    expect(parsed.modelParameters.temperature).toBe(0.7);
    expect(parsed.prompt[0].content).toBe("Updated system prompt.");
  });

  it("fails when segment count changes without flag", () => {
    const result = buildPromptUpdate({
      originalCustomConfiguration: VALID_CONFIG,
      newPrompts: [{ role: "system", content: "Only one segment now." }],
    });
    expect(result.validation.ok).toBe(false);
    expect(result.validation.errors[0]).toContain("segment count changed");
    expect(result.newCustomConfiguration).toBeUndefined();
  });

  it("succeeds when segment count changes with allowSegmentShapeChange", () => {
    const result = buildPromptUpdate({
      originalCustomConfiguration: VALID_CONFIG,
      newPrompts: [{ role: "system", content: "Only one now." }],
      allowSegmentShapeChange: true,
      allowPlaceholderChange: true,
    });
    expect(result.validation.ok).toBe(true);
    expect(result.newCustomConfiguration).toBeDefined();
  });

  it("fails when role changes without flag", () => {
    const result = buildPromptUpdate({
      originalCustomConfiguration: VALID_CONFIG,
      newPrompts: [
        { role: "user", content: "Was system, now user." },
        {
          role: "user",
          content: "About {{topic}} for {{user_name}}.",
        },
      ],
    });
    expect(result.validation.ok).toBe(false);
    expect(
      result.validation.errors.some((e) => e.includes("role changed")),
    ).toBe(true);
  });

  it("fails when placeholders change without flag", () => {
    const result = buildPromptUpdate({
      originalCustomConfiguration: VALID_CONFIG,
      newPrompts: [
        { role: "system", content: "You are a helper." },
        { role: "user", content: "Answer about {{new_placeholder}}." },
      ],
    });
    expect(result.validation.ok).toBe(false);
    expect(
      result.validation.errors.some((e) =>
        e.includes("Placeholder set changed"),
      ),
    ).toBe(true);
    expect(result.validation.placeholdersRemoved).toContain("topic");
    expect(result.validation.placeholdersRemoved).toContain("user_name");
    expect(result.validation.placeholdersAdded).toContain("new_placeholder");
  });

  it("warns (but succeeds) when placeholders change with allowPlaceholderChange", () => {
    const result = buildPromptUpdate({
      originalCustomConfiguration: VALID_CONFIG,
      newPrompts: [
        { role: "system", content: "You are a helper." },
        { role: "user", content: "About {{new_one}}." },
      ],
      allowPlaceholderChange: true,
    });
    expect(result.validation.ok).toBe(true);
    expect(result.validation.warnings.length).toBeGreaterThan(0);
    expect(result.newCustomConfiguration).toBeDefined();
  });

  it("preserves all top-level keys", () => {
    const result = buildPromptUpdate({
      originalCustomConfiguration: VALID_CONFIG,
      newPrompts: [
        { role: "system", content: "Updated." },
        { role: "user", content: "{{topic}} for {{user_name}}." },
      ],
    });
    expect(result.validation.ok).toBe(true);
    const parsed = JSON.parse(result.newCustomConfiguration!);
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "code",
        "definitions",
        "modelParameters",
        "prompt",
        "settings",
        "signature",
      ].sort(),
    );
  });

  it("reports segment counts in validation", () => {
    const result = buildPromptUpdate({
      originalCustomConfiguration: VALID_CONFIG,
      newPrompts: [
        { role: "system", content: "Updated." },
        { role: "user", content: "{{topic}} for {{user_name}}." },
      ],
    });
    expect(result.validation.segmentCountBefore).toBe(2);
    expect(result.validation.segmentCountAfter).toBe(2);
  });

  it("throws on invalid originalCustomConfiguration", () => {
    expect(() =>
      buildPromptUpdate({
        originalCustomConfiguration: "broken json",
        newPrompts: [{ role: "system", content: "x" }],
      }),
    ).toThrow("not valid JSON");
  });
});
