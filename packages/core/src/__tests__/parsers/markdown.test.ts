import { describe, it, expect } from "vitest";
import {
  isTemplateOnly,
  extractMarkdownSection,
} from "../../parsers/markdown.js";

// ── isTemplateOnly ───────────────────────────────────────────

describe("isTemplateOnly", () => {
  it("returns true for empty string", () => {
    expect(isTemplateOnly("")).toBe(true);
  });

  it("returns true for headings-only document", () => {
    expect(isTemplateOnly("# Title\n## Section\n### Sub")).toBe(true);
  });

  it("returns true for template with placeholders and checkboxes", () => {
    const template = `# Spec
## Overview
-
## Checklist
- [ ] Item one
- [x] Item two
## Table
| Column A | Column B |
|----------|----------|
|          |          |
`;
    expect(isTemplateOnly(template)).toBe(true);
  });

  it("returns true for bold-label list items", () => {
    expect(isTemplateOnly("- **Name:** \n- **Status:**")).toBe(true);
  });

  it("returns true for HTML comments", () => {
    expect(isTemplateOnly("<!-- Comment -->\n# Title")).toBe(true);
  });

  it("returns true for numbered placeholder list", () => {
    expect(isTemplateOnly("1.\n2.\n3.")).toBe(true);
  });

  it("returns false when real content exists", () => {
    expect(
      isTemplateOnly("# Spec\n## Overview\nThis agent handles billing."),
    ).toBe(false);
  });

  it("returns false for a single sentence", () => {
    expect(isTemplateOnly("The agent routes queries.")).toBe(false);
  });

  it("returns true for empty table data rows (any column count)", () => {
    expect(isTemplateOnly("| | |")).toBe(true);
    expect(isTemplateOnly("|   |   |   |")).toBe(true);
  });

  it("returns true for table header rows with words only", () => {
    expect(isTemplateOnly("| Tool | Agent | Purpose |")).toBe(true);
    expect(isTemplateOnly("| Name | Status |")).toBe(true);
  });

  it("returns true for single dash placeholder list item", () => {
    expect(isTemplateOnly("-")).toBe(true);
    expect(isTemplateOnly("# Title\n-\n-")).toBe(true);
  });

  it("returns false for table rows with real data containing special chars", () => {
    expect(
      isTemplateOnly(
        "| Microsoft Dataverse - List rows | IT Agent | Read incident rows | Yes — add connector |",
      ),
    ).toBe(false);
  });
});

// ── extractMarkdownSection ───────────────────────────────────

describe("extractMarkdownSection", () => {
  const DOC = `# Main Title

## Overview

This is the overview section with details.

## Architecture

Multi-agent design with routing.

## Build State

- [ ] Step one
- [x] Step two
`;

  it("extracts a section by heading", () => {
    const result = extractMarkdownSection(DOC, "Overview");
    expect(result).toBe("This is the overview section with details.");
  });

  it("extracts a different section", () => {
    const result = extractMarkdownSection(DOC, "Architecture");
    expect(result).toBe("Multi-agent design with routing.");
  });

  it("extracts the last section (no trailing ##)", () => {
    const result = extractMarkdownSection(DOC, "Build State");
    expect(result).toContain("Step one");
    expect(result).toContain("Step two");
  });

  it("returns empty string for non-existent heading", () => {
    expect(extractMarkdownSection(DOC, "Missing Section")).toBe("");
  });

  it("handles heading with special regex characters", () => {
    const doc = "## Tools & Connectors\n\nSome content here.\n\n## Next";
    expect(extractMarkdownSection(doc, "Tools & Connectors")).toBe(
      "Some content here.",
    );
  });

  it("returns empty string for empty document", () => {
    expect(extractMarkdownSection("", "Overview")).toBe("");
  });

  it("does not match level-3 headings", () => {
    const doc = "### Overview\n\nNested heading content.";
    expect(extractMarkdownSection(doc, "Overview")).toBe("");
  });
});
