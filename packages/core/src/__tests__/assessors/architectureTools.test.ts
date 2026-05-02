import { describe, it, expect } from "vitest";
import {
  parseArchitectureToolsTable,
  findArchitectureConnectorNamingMismatches,
} from "../../assessors/architectureTools.js";

const ARCH_DOC = `# Architecture

## Tools & Connectors

| Tool | Owner Agent | Purpose | Manual Portal Step Required |
|------|-------------|---------|----------------------------|
| Microsoft Dataverse - List rows from selected environment | IT Agent | Read incident rows | Yes — add connector |
| Send Email Tool | Notifier | Send email to requester | Yes — add connector |
| Custom MCP Server | Analyzer | Run analysis | No |

## Build State

- [ ] Step one
`;

describe("parseArchitectureToolsTable", () => {
  it("parses a well-formed table", () => {
    const rows = parseArchitectureToolsTable(ARCH_DOC);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      tool: "Microsoft Dataverse - List rows from selected environment",
      ownerAgent: "IT Agent",
      purpose: "Read incident rows",
      manualPortalStepRequired: "Yes — add connector",
    });
  });

  it("returns empty array when section is missing", () => {
    expect(parseArchitectureToolsTable("# No tools section here")).toEqual([]);
  });

  it("returns empty array for empty document", () => {
    expect(parseArchitectureToolsTable("")).toEqual([]);
  });

  it("skips placeholder rows", () => {
    const doc = `## Tools & Connectors

| Tool | Owner Agent | Purpose | Manual Portal Step Required |
|------|-------------|---------|----------------------------|
| (none defined yet) | - | - | - |
`;
    expect(parseArchitectureToolsTable(doc)).toEqual([]);
  });

  it("skips lines that are not table rows", () => {
    const doc = `## Tools & Connectors

Some preamble text.

| Tool | Owner Agent | Purpose | Manual Portal Step Required |
|------|-------------|---------|----------------------------|
| MyTool | Agent | Does stuff | No |

More text after.
`;
    const rows = parseArchitectureToolsTable(doc);
    expect(rows).toHaveLength(1);
    expect(rows[0].tool).toBe("MyTool");
  });
});

describe("findArchitectureConnectorNamingMismatches", () => {
  it("flags misnamed email connector", () => {
    const mismatches = findArchitectureConnectorNamingMismatches(ARCH_DOC);
    const emailMismatch = mismatches.find(
      (m) => m.actualTool === "Send Email Tool",
    );
    expect(emailMismatch).toBeDefined();
    expect(emailMismatch!.expectedTool).toContain("Office 365 Outlook");
  });

  it("does not flag correctly named connectors", () => {
    const mismatches = findArchitectureConnectorNamingMismatches(ARCH_DOC);
    const dvMatch = mismatches.find((m) =>
      m.actualTool.includes("Microsoft Dataverse"),
    );
    expect(dvMatch).toBeUndefined();
  });

  it("does not flag unknown tools (non-catalog)", () => {
    const mismatches = findArchitectureConnectorNamingMismatches(ARCH_DOC);
    const customMatch = mismatches.find(
      (m) => m.actualTool === "Custom MCP Server",
    );
    expect(customMatch).toBeUndefined();
  });

  it("returns empty array when no tools section", () => {
    expect(findArchitectureConnectorNamingMismatches("# No tools")).toEqual([]);
  });
});
