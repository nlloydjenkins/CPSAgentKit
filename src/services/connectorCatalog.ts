export type ConnectorOperationKind =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "notify-email"
  | "notify-message"
  | "notify-card"
  | "profile-read"
  | "file-read"
  | "file-write"
  | "spreadsheet-read"
  | "spreadsheet-write"
  | "identity-read";

export interface CuratedConnectorAction {
  actionName: string;
  operationKinds: ConnectorOperationKind[];
  notes?: string[];
}

export interface CuratedConnectorCatalogEntry {
  connectorName: string;
  docsUrl: string;
  aliases: string[];
  notes?: string[];
  actions: CuratedConnectorAction[];
}

export interface ResolvedConnectorAction {
  connectorName: string;
  actionName: string;
  docsUrl: string;
  notes: string[];
}

export interface CuratedConnectorDisplayName {
  connectorName: string;
  actionName: string;
  displayName: string;
}

const CONNECTOR_REFERENCE_URL =
  "https://learn.microsoft.com/en-us/connectors/connector-reference#list-of-connectors";

export const CURATED_CONNECTOR_CATALOG: CuratedConnectorCatalogEntry[] = [
  {
    connectorName: "Microsoft Dataverse",
    docsUrl: CONNECTOR_REFERENCE_URL,
    aliases: [
      "dataverse",
      "row",
      "rows",
      "record",
      "records",
      "table",
      "tables",
      "incident row",
    ],
    notes: [
      "Prefer shared CRUD actions instead of function-specific renamed copies.",
      "Use exact schema names in filters and examples.",
    ],
    actions: [
      {
        actionName: "List rows from selected environment",
        operationKinds: ["read"],
      },
      {
        actionName: "Add a new row to selected environment",
        operationKinds: ["create"],
      },
      {
        actionName: "Update a row",
        operationKinds: ["update"],
      },
      {
        actionName: "Delete a row",
        operationKinds: ["delete"],
      },
    ],
  },
  {
    connectorName: "SharePoint",
    docsUrl: CONNECTOR_REFERENCE_URL,
    aliases: ["sharepoint", "document library", "sharepoint list", "list item"],
    notes: [
      "Use for site, file, and list-based integrations when Dataverse is not the right transactional store.",
    ],
    actions: [
      {
        actionName: "Get items",
        operationKinds: ["read"],
      },
      {
        actionName: "Create item",
        operationKinds: ["create"],
      },
      {
        actionName: "Update item",
        operationKinds: ["update"],
      },
    ],
  },
  {
    connectorName: "Office 365 Outlook",
    docsUrl: CONNECTOR_REFERENCE_URL,
    aliases: ["outlook", "email", "mailbox", "shared mailbox", "on-call"],
    notes: [
      "Use the standard mail action names; choose shared mailbox variants only when the architecture requires them.",
    ],
    actions: [
      {
        actionName: "Send an email (V2)",
        operationKinds: ["notify-email"],
      },
      {
        actionName: "Send an email from a shared mailbox (V2)",
        operationKinds: ["notify-email"],
      },
    ],
  },
  {
    connectorName: "Office 365 Users",
    docsUrl: CONNECTOR_REFERENCE_URL,
    aliases: [
      "user profile",
      "profile",
      "manager",
      "department",
      "upn",
      "organizational context",
      "organisational context",
    ],
    notes: [
      "Good default for Entra-backed user directory/profile lookups in CPS solutions.",
    ],
    actions: [
      {
        actionName: "Get user profile (V2)",
        operationKinds: ["profile-read"],
      },
      {
        actionName: "Search for users (V2)",
        operationKinds: ["profile-read"],
      },
      {
        actionName: "Get manager (V2)",
        operationKinds: ["profile-read"],
      },
    ],
  },
  {
    connectorName: "Microsoft Teams",
    docsUrl: CONNECTOR_REFERENCE_URL,
    aliases: [
      "teams",
      "chat",
      "channel",
      "adaptive card",
      "teams message",
      "summary card",
    ],
    notes: [
      "Prefer the standard Teams posting actions rather than renaming them by business function.",
    ],
    actions: [
      {
        actionName: "Post message in a chat or channel",
        operationKinds: ["notify-message"],
      },
      {
        actionName: "Post card in a chat or channel",
        operationKinds: ["notify-card"],
      },
    ],
  },
  {
    connectorName: "Excel Online (Business)",
    docsUrl: CONNECTOR_REFERENCE_URL,
    aliases: ["excel", "spreadsheet", "workbook", "worksheet", "excel table"],
    notes: [
      "Useful when the architecture genuinely relies on workbook tables, but avoid using Excel as a substitute for transactional storage.",
    ],
    actions: [
      {
        actionName: "List rows present in a table",
        operationKinds: ["spreadsheet-read"],
      },
      {
        actionName: "Add a row into a table",
        operationKinds: ["spreadsheet-write", "create"],
      },
      {
        actionName: "Update a row",
        operationKinds: ["spreadsheet-write", "update"],
      },
    ],
  },
  {
    connectorName: "OneDrive for Business",
    docsUrl: CONNECTOR_REFERENCE_URL,
    aliases: ["onedrive", "file upload", "file download", "working file"],
    notes: [
      "Useful for document handoff and file staging in user-scoped flows.",
    ],
    actions: [
      {
        actionName: "Get file content",
        operationKinds: ["file-read"],
      },
      {
        actionName: "Create file",
        operationKinds: ["file-write", "create"],
      },
    ],
  },
  {
    connectorName: "Microsoft Entra ID",
    docsUrl: CONNECTOR_REFERENCE_URL,
    aliases: [
      "entra",
      "entra id",
      "azure ad",
      "aad",
      "identity",
      "group membership",
    ],
    notes: [
      "Use when the architecture needs directory or group membership lookups that are not better served by Office 365 Users.",
    ],
    actions: [
      {
        actionName: "Get user",
        operationKinds: ["identity-read"],
      },
      {
        actionName: "List groups for a user",
        operationKinds: ["identity-read"],
      },
    ],
  },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function determineOperationKind(text: string): ConnectorOperationKind {
  if (/(adaptive card|summary card|post card)/i.test(text)) {
    return "notify-card";
  }
  if (/(post message|chat|channel|teams message)/i.test(text)) {
    return "notify-message";
  }
  if (/(email|mailbox|send mail|on-call)/i.test(text)) {
    return "notify-email";
  }
  if (
    /(profile|manager|department|upn|organizational|organisational)/i.test(text)
  ) {
    return "profile-read";
  }
  if (/(excel|spreadsheet|workbook|worksheet)/i.test(text)) {
    if (/(create|add|insert|write)/i.test(text)) {
      return "spreadsheet-write";
    }
    return "spreadsheet-read";
  }
  if (/(file upload|create file|write file)/i.test(text)) {
    return "file-write";
  }
  if (/(file read|file content|download file)/i.test(text)) {
    return "file-read";
  }
  if (/(entra|azure ad|aad|group membership|identity)/i.test(text)) {
    return "identity-read";
  }
  if (/(delete|remove)/i.test(text)) {
    return "delete";
  }
  if (/(update|modify|change)/i.test(text)) {
    return "update";
  }
  if (/(create|add|insert)/i.test(text)) {
    return "create";
  }
  return "read";
}

function findCatalogEntry(text: string): CuratedConnectorCatalogEntry | null {
  const normalizedText = normalize(text);

  for (const entry of CURATED_CONNECTOR_CATALOG) {
    if (
      normalize(entry.connectorName) &&
      normalizedText.includes(normalize(entry.connectorName))
    ) {
      return entry;
    }

    if (
      entry.aliases.some((alias) => normalizedText.includes(normalize(alias)))
    ) {
      return entry;
    }
  }

  return null;
}

export function resolveCuratedConnectorRequirement(
  toolName: string,
  purpose: string,
): ResolvedConnectorAction | null {
  const combined = `${toolName} ${purpose}`;
  const entry = findCatalogEntry(combined);
  if (!entry) {
    return null;
  }

  const operationKind = determineOperationKind(combined);
  const action =
    entry.actions.find((candidate) =>
      candidate.operationKinds.includes(operationKind),
    ) ?? entry.actions[0];

  return {
    connectorName: entry.connectorName,
    actionName: action.actionName,
    docsUrl: entry.docsUrl,
    notes: [...(entry.notes ?? []), ...(action.notes ?? [])],
  };
}

export function listCuratedConnectorDisplayNames(): CuratedConnectorDisplayName[] {
  return CURATED_CONNECTOR_CATALOG.flatMap((entry) =>
    entry.actions.map((action) => ({
      connectorName: entry.connectorName,
      actionName: action.actionName,
      displayName: `${entry.connectorName} - ${action.actionName}`,
    })),
  );
}
