import { describe, it, expect } from "vitest";
import { validateToolDescription } from "../../assessors/toolDescription.js";

describe("validateToolDescription", () => {
  const GOOD_DESCRIPTION =
    "Retrieves customer order history from Dataverse. Use this when the user asks about past orders, order status, or delivery tracking. Expects order_id or customer_email as input. Do not use this for creating new orders.";

  it("approves a well-formed description", () => {
    const result = validateToolDescription(GOOD_DESCRIPTION);
    expect(result.ok).toBe(true);
    expect(result.issues.every((i) => i.severity !== "error")).toBe(true);
  });

  it("reports length and word count", () => {
    const result = validateToolDescription(GOOD_DESCRIPTION);
    expect(result.length).toBe(GOOD_DESCRIPTION.length);
    expect(result.wordCount).toBeGreaterThan(10);
  });

  // ── Empty description ──

  it("errors on empty description", () => {
    const result = validateToolDescription("");
    expect(result.ok).toBe(false);
    expect(result.issues[0].severity).toBe("error");
    expect(result.issues[0].message).toContain("Empty");
  });

  it("errors on whitespace-only description", () => {
    const result = validateToolDescription("   \n  ");
    expect(result.ok).toBe(false);
  });

  // ── Length ──

  it("warns when description is too short", () => {
    const result = validateToolDescription("Gets orders.");
    expect(result.issues.some((i) => i.message.includes("very short"))).toBe(
      true,
    );
  });

  it("warns when description exceeds max length", () => {
    const long = "A".repeat(1001);
    const result = validateToolDescription(long);
    expect(result.issues.some((i) => i.message.includes("long"))).toBe(true);
  });

  // ── Vague openers ──

  it("warns on vague opener 'Helps'", () => {
    const result = validateToolDescription(
      "Helps users find information about their accounts and provides them with relevant data from the database system.",
    );
    expect(result.issues.some((i) => i.message.includes("vague verb"))).toBe(
      true,
    );
  });

  it("warns on vague opener 'Manages'", () => {
    const result = validateToolDescription(
      "Manages the lifecycle of service requests including creation, updates, and status tracking across environments.",
    );
    expect(result.issues.some((i) => i.message.includes("vague verb"))).toBe(
      true,
    );
  });

  // ── Missing cues ──

  it("flags missing 'when to call' cue", () => {
    const result = validateToolDescription(
      "Retrieves customer records from the database with full contact details and history.",
    );
    expect(result.issues.some((i) => i.message.includes("when to call"))).toBe(
      true,
    );
  });

  it("flags missing boundary statement for tools", () => {
    const result = validateToolDescription(
      "Retrieves customer records from the database. Use this when the user asks about customer info.",
    );
    expect(result.issues.some((i) => i.message.includes("boundary"))).toBe(
      true,
    );
  });

  it("does NOT flag missing boundary for topics", () => {
    const result = validateToolDescription(
      "Retrieves customer records from the database. Use this when the user asks about customer info.",
      "topic",
    );
    expect(result.issues.some((i) => i.message.includes("boundary"))).toBe(
      false,
    );
  });

  it("flags missing input description for tools", () => {
    const result = validateToolDescription(
      "Retrieves customer records. Use this when asked about customers. Do not use for billing.",
    );
    expect(result.issues.some((i) => i.message.includes("input"))).toBe(true);
  });

  // ── Kind parameter ──

  it("accepts 'agent' kind", () => {
    const result = validateToolDescription(GOOD_DESCRIPTION, "agent");
    expect(result.ok).toBe(true);
  });

  it("applies kind in error message for empty description", () => {
    const result = validateToolDescription("", "topic");
    expect(result.issues[0].message).toContain("topic");
  });
});
