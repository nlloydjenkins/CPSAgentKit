import { describe, it, expect } from "vitest";
import {
  resolveCuratedConnectorRequirement,
  listCuratedConnectorDisplayNames,
  CURATED_CONNECTOR_CATALOG,
} from "../../assessors/connectorCatalog.js";

describe("CURATED_CONNECTOR_CATALOG", () => {
  it("is a non-empty array", () => {
    expect(CURATED_CONNECTOR_CATALOG.length).toBeGreaterThan(0);
  });

  it("every entry has connectorName, docsUrl, aliases, and actions", () => {
    for (const entry of CURATED_CONNECTOR_CATALOG) {
      expect(entry.connectorName).toBeTruthy();
      expect(entry.docsUrl).toBeTruthy();
      expect(Array.isArray(entry.aliases)).toBe(true);
      expect(entry.actions.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveCuratedConnectorRequirement", () => {
  it("resolves Dataverse read operation", () => {
    const result = resolveCuratedConnectorRequirement(
      "Dataverse lookup",
      "Read incident rows from the table",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("Microsoft Dataverse");
    expect(result!.actionName).toContain("List rows");
  });

  it("resolves Dataverse create operation", () => {
    const result = resolveCuratedConnectorRequirement(
      "Create record",
      "Add a new incident to Dataverse",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("Microsoft Dataverse");
    expect(result!.actionName).toContain("Add a new row");
  });

  it("resolves email sending via alias", () => {
    const result = resolveCuratedConnectorRequirement(
      "Send notification",
      "Send email to the user",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("Office 365 Outlook");
    expect(result!.actionName).toContain("Send an email");
  });

  it("resolves Teams message via alias", () => {
    const result = resolveCuratedConnectorRequirement(
      "Post teams message",
      "Notify the channel about the update",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("Microsoft Teams");
  });

  it("resolves SharePoint via alias", () => {
    const result = resolveCuratedConnectorRequirement(
      "Get list item",
      "Read items from SharePoint list",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("SharePoint");
  });

  it("returns null for unknown tool", () => {
    const result = resolveCuratedConnectorRequirement(
      "Custom API",
      "Call a proprietary REST endpoint",
    );
    expect(result).toBeNull();
  });

  it("includes notes from both entry and action", () => {
    const result = resolveCuratedConnectorRequirement(
      "Dataverse",
      "Read rows from table",
    );
    expect(result).not.toBeNull();
    expect(result!.notes.length).toBeGreaterThan(0);
  });

  it("resolves delete operation", () => {
    const result = resolveCuratedConnectorRequirement(
      "Delete Dataverse row",
      "Remove a record from the table",
    );
    expect(result).not.toBeNull();
    expect(result!.actionName).toContain("Delete");
  });

  it("resolves update operation", () => {
    const result = resolveCuratedConnectorRequirement(
      "Update Dataverse row",
      "Modify a record in Dataverse",
    );
    expect(result).not.toBeNull();
    expect(result!.actionName).toContain("Update");
  });

  it("resolves adaptive card posting via Teams", () => {
    const result = resolveCuratedConnectorRequirement(
      "Post summary card",
      "Send adaptive card to channel",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("Microsoft Teams");
    expect(result!.actionName).toContain("card");
  });

  it("resolves user profile lookup", () => {
    const result = resolveCuratedConnectorRequirement(
      "Get user profile",
      "Look up user profile and manager",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("Office 365 Users");
  });

  it("resolves Excel operations", () => {
    const result = resolveCuratedConnectorRequirement(
      "Excel Online (Business)",
      "Get worksheets from workbook",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("Excel Online (Business)");
  });

  it("resolves OneDrive file operations", () => {
    const result = resolveCuratedConnectorRequirement(
      "Download file",
      "Get file content from OneDrive",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("OneDrive for Business");
  });

  it("resolves Entra ID operations", () => {
    const result = resolveCuratedConnectorRequirement(
      "Check group membership",
      "List groups for a user in Entra",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("Microsoft Entra ID");
  });

  it("resolves shared mailbox email", () => {
    const result = resolveCuratedConnectorRequirement(
      "Send from shared mailbox",
      "Send email from shared mailbox",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("Office 365 Outlook");
  });
});

describe("listCuratedConnectorDisplayNames", () => {
  it("returns an array of display names", () => {
    const names = listCuratedConnectorDisplayNames();
    expect(names.length).toBeGreaterThan(0);
  });

  it("each entry has connectorName, actionName, and displayName", () => {
    const names = listCuratedConnectorDisplayNames();
    for (const n of names) {
      expect(n.connectorName).toBeTruthy();
      expect(n.actionName).toBeTruthy();
      expect(n.displayName).toBe(`${n.connectorName} - ${n.actionName}`);
    }
  });

  it("contains the expected Dataverse connector", () => {
    const names = listCuratedConnectorDisplayNames();
    expect(names.some((n) => n.connectorName === "Microsoft Dataverse")).toBe(
      true,
    );
  });

  it("resolves Excel write operations", () => {
    const result = resolveCuratedConnectorRequirement(
      "Excel Online (Business)",
      "Add entry to workbook worksheet",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("Excel Online (Business)");
    expect(result!.actionName).toContain("Add");
  });

  it("resolves SharePoint file operations", () => {
    const result = resolveCuratedConnectorRequirement(
      "SharePoint - Create file",
      "Upload document to library",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("SharePoint");
  });

  it("resolves connector by alias when name is not in text", () => {
    // "spreadsheet" alias matches Excel without mentioning "Excel Online"
    const result = resolveCuratedConnectorRequirement(
      "Read data tool",
      "Get data from spreadsheet",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("Excel Online (Business)");
  });

  it("resolves file-write operation kind for OneDrive", () => {
    const result = resolveCuratedConnectorRequirement(
      "OneDrive for Business",
      "Create file in user drive",
    );
    expect(result).not.toBeNull();
    expect(result!.connectorName).toBe("OneDrive for Business");
    expect(result!.actionName).toBe("Create file");
  });

  it("resolves spreadsheet-write operation kind", () => {
    const result = resolveCuratedConnectorRequirement(
      "Excel Online (Business)",
      "Insert new entries into workbook worksheet",
    );
    expect(result).not.toBeNull();
    expect(result!.actionName).toContain("Add");
  });
});
