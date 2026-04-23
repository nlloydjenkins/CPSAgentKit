/**
 * Parse the "## Tools & Connectors" table in architecture.md and compare
 * tool names against the curated connector catalog.
 */
import {
  listCuratedConnectorDisplayNames,
  resolveCuratedConnectorRequirement,
} from "./connectorCatalog.js";
import { extractMarkdownSection } from "../parsers/markdown.js";

export interface ArchitectureToolRow {
  tool: string;
  ownerAgent: string;
  purpose: string;
  manualPortalStepRequired: string;
}

export interface ConnectorNamingMismatch {
  actualTool: string;
  expectedTool: string;
  ownerAgent: string;
  purpose: string;
}

export function parseArchitectureToolsTable(
  architecture: string,
): ArchitectureToolRow[] {
  const section = extractMarkdownSection(architecture, "Tools & Connectors");
  if (!section) {
    return [];
  }

  const rows: ArchitectureToolRow[] = [];
  const lines = section.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      continue;
    }

    if (/^\|\s*-+/.test(trimmed) || /^\|\s*Tool\s*\|/i.test(trimmed)) {
      continue;
    }

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length < 4) {
      continue;
    }

    if (cells[0] === "(none defined yet)") {
      continue;
    }

    rows.push({
      tool: cells[0],
      ownerAgent: cells[1],
      purpose: cells[2],
      manualPortalStepRequired: cells[3],
    });
  }

  return rows;
}

export function findArchitectureConnectorNamingMismatches(
  architecture: string,
): ConnectorNamingMismatch[] {
  const rows = parseArchitectureToolsTable(architecture);
  const mismatches: ConnectorNamingMismatch[] = [];

  for (const row of rows) {
    const resolved = resolveCuratedConnectorRequirement(row.tool, row.purpose);
    if (!resolved) {
      continue;
    }

    const expectedTool = `${resolved.connectorName} - ${resolved.actionName}`;
    if (row.tool === expectedTool) {
      continue;
    }

    mismatches.push({
      actualTool: row.tool,
      expectedTool,
      ownerAgent: row.ownerAgent,
      purpose: row.purpose,
    });
  }

  return mismatches;
}

export { listCuratedConnectorDisplayNames };
