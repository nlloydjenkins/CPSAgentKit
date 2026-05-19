/**
 * Plan Dataverse `botcomponent.description` PATCH operations for uploaded-file
 * knowledge sources on a CPS agent.
 *
 * Background: the official Copilot Studio VS Code extension creates a local
 * mirror at `<agentFolder>/knowledge/files/<file>.mcs.yml` after Get Changes,
 * but the `mcs.metadata.description` field there is a boilerplate placeholder
 * that does NOT round-trip back to Dataverse on Apply Changes. The real
 * description used by the orchestrator for source selection lives on the
 * `botcomponent.description` column and must be PATCHed via the Dataverse
 * Web API.
 *
 * This module is I/O-light: it reads YAML mirror files and `.mcs/conn.json`,
 * extracts the data needed to PATCH, and emits a plan. It does not perform
 * any network calls — callers (CLI script, extension command, MCP host) are
 * responsible for token acquisition and HTTP. Keeping the planner pure makes
 * it trivially testable and safe to call from any host context.
 */

import * as fs from "fs/promises";
import * as path from "path";

/** Connection info extracted from `<agentFolder>/.mcs/conn.json`. */
export interface KnowledgeConnInfo {
  dataverseEndpoint: string;
  environmentId?: string;
  agentId: string;
  tenantId: string;
  accountEmail?: string;
}

/** One planned PATCH against a Dataverse `botcomponent` row. */
export interface KnowledgeDescriptionPlanEntry {
  /** Workspace-relative path of the local mirror YAML file. */
  yamlPath: string;
  /** Value of `mcs.metadata.componentName` from the mirror (file name). */
  componentName: string;
  /**
   * The description string we plan to PATCH onto Dataverse. By convention this
   * comes from a `cpsAgentKit.description` block at the top of the YAML
   * (preferred — survives Apply Changes) or, as a fallback, from
   * `mcs.metadata.description` when it is not the auto-generated placeholder.
   */
  description: string;
  /** Source of the description: the explicit override block or the mirror. */
  descriptionSource: "cpsAgentKit-override" | "mcs-metadata";
  /**
   * Whether the description currently in the mirror YAML looks like the
   * auto-generated placeholder ("This knowledge source searches information
   * contained in <file>"). When true, makers must supply a real description
   * — the planner refuses to PATCH placeholders to Dataverse.
   */
  mirrorIsPlaceholder: boolean;
  /** Whether this entry can be PATCHed as-is. */
  ready: boolean;
  /**
   * Human-readable reason an entry is not ready, when `ready` is false.
   * Stable strings — callers can branch on them.
   */
  notReadyReason?:
    | "missing-component-name"
    | "missing-description"
    | "placeholder-description";
  /**
   * Lookup request the caller should issue first to resolve the
   * `botcomponentid` from `(name, parentbotid)`. The caller substitutes
   * `{agentId}` if needed (already filled), and URL-encodes the `name`.
   */
  lookupRequest: {
    method: "GET";
    url: string;
  };
  /**
   * PATCH request shape, with `{botComponentId}` placeholder that the caller
   * must replace with the id returned by the lookup. Body is the JSON to
   * send.
   */
  patchRequest: {
    method: "PATCH";
    urlTemplate: string;
    headers: Record<string, string>;
    body: { description: string };
  };
}

/** Result of planning descriptions across one agent folder. */
export interface KnowledgeDescriptionPlan {
  agentFolder: string;
  conn: KnowledgeConnInfo;
  entries: KnowledgeDescriptionPlanEntry[];
  warnings: string[];
}

const PLACEHOLDER_RE =
  /^This knowledge source searches information contained in .+\.?$/i;

const DEFAULT_HEADERS = {
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  "Content-Type": "application/json",
  Accept: "application/json",
};

/**
 * Extract a string value from a `mcs.metadata:` (or other named top-level)
 * block. Pragmatic line-based scan — we do not depend on a YAML parser so
 * this stays usable from the MCP server without adding js-yaml.
 *
 * Supports:
 *   parent:
 *     key: value
 *     key: "quoted value"
 *     key: 'quoted value'
 *     key: >-
 *       block scalar line 1
 *       block scalar line 2
 *
 * Returns undefined if the key is not found under `parent`.
 */
export function extractScalar(
  yaml: string,
  parent: string,
  key: string,
): string | undefined {
  const lines = yaml.split(/\r?\n/);
  let inParent = false;
  let parentIndent = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inParent) {
      const m = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*$/);
      if (m && m[2] === parent) {
        inParent = true;
        parentIndent = m[1].length;
      }
      continue;
    }
    // Done with parent block once we hit a non-indented or same/less-indented key.
    const indentMatch = line.match(/^(\s*)\S/);
    if (indentMatch && indentMatch[1].length <= parentIndent) {
      return undefined;
    }
    const kv = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!kv) continue;
    if (kv[2] !== key) continue;
    const rawValue = kv[3];
    // Inline scalar.
    if (rawValue && !/^[>|][-+]?\s*$/.test(rawValue)) {
      return stripQuotes(rawValue.trim());
    }
    // Block scalar — concatenate subsequent more-indented lines.
    const keyIndent = kv[1].length;
    const collected: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j];
      const ni = next.match(/^(\s*)(\S.*)?$/);
      if (!ni) break;
      if (next.trim() === "") {
        collected.push("");
        continue;
      }
      if (ni[1].length <= keyIndent) break;
      collected.push(next.slice(keyIndent + 2));
    }
    // For >- folded scalars, join with spaces; for | literal, join with \n.
    const folded = rawValue.startsWith(">");
    const joined = folded
      ? collected.filter((l) => l.length > 0).join(" ")
      : collected.join("\n");
    return joined.replace(/\s+$/g, "").trim() || undefined;
  }
  return undefined;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Detect the auto-generated placeholder description the official extension
 * writes into mirror YAML.
 */
export function isPlaceholderDescription(value: string | undefined): boolean {
  if (!value) return false;
  return PLACEHOLDER_RE.test(value.trim());
}

/** Read and validate `<agentFolder>/.mcs/conn.json`. */
export async function readConnInfo(
  agentFolder: string,
): Promise<KnowledgeConnInfo> {
  const connPath = path.join(agentFolder, ".mcs", "conn.json");
  let raw: string;
  try {
    raw = await fs.readFile(connPath, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read ${connPath}. Run Get Changes from the Copilot Studio extension first. (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `${connPath} is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const dataverseEndpoint = stringField(parsed, "DataverseEndpoint");
  const agentId = stringField(parsed, "AgentId");
  const account = (parsed["AccountInfo"] ?? {}) as Record<string, unknown>;
  const tenantId = stringField(account, "TenantId");
  const accountEmail = optionalStringField(account, "AccountEmail");
  const environmentId = optionalStringField(parsed, "EnvironmentId");
  if (!dataverseEndpoint || !agentId || !tenantId) {
    throw new Error(
      `${connPath} is missing required fields (DataverseEndpoint, AgentId, AccountInfo.TenantId).`,
    );
  }
  return {
    dataverseEndpoint: dataverseEndpoint.replace(/\/+$/, ""),
    environmentId,
    agentId,
    tenantId,
    accountEmail,
  };
}

function stringField(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function optionalStringField(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  return stringField(obj, key);
}

async function listMirrorYamlFiles(agentFolder: string): Promise<string[]> {
  const out: string[] = [];
  await walkKnowledgeFiles(agentFolder, out);
  // Also pick up child-agent mirrors at `agents/*/knowledge/files/`.
  const childRoot = path.join(agentFolder, "agents");
  let childEntries: { name: string; isDirectory: () => boolean }[] = [];
  try {
    childEntries = (await fs.readdir(childRoot, {
      withFileTypes: true,
    })) as unknown as { name: string; isDirectory: () => boolean }[];
  } catch {
    // No child-agent folder.
  }
  for (const entry of childEntries) {
    if (entry.isDirectory()) {
      await walkKnowledgeFiles(path.join(childRoot, entry.name), out);
    }
  }
  return out;
}

async function walkKnowledgeFiles(
  ownerFolder: string,
  out: string[],
): Promise<void> {
  const dir = path.join(ownerFolder, "knowledge", "files");
  let entries: { name: string; isFile: () => boolean }[];
  try {
    entries = (await fs.readdir(dir, {
      withFileTypes: true,
    })) as unknown as { name: string; isFile: () => boolean }[];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".mcs.yml")) continue;
    out.push(path.join(dir, entry.name));
  }
}

/**
 * Build a Dataverse `botcomponents` lookup URL filtered by component name and
 * `_parentbotid_value`. Names are URL-encoded; single quotes are doubled per
 * OData v4 escaping rules.
 */
export function buildLookupUrl(
  dataverseEndpoint: string,
  agentId: string,
  componentName: string,
): string {
  const escapedName = componentName.replace(/'/g, "''");
  const filter =
    `componenttype eq 14 and _parentbotid_value eq ${agentId} ` +
    `and name eq '${escapedName}'`;
  return `${dataverseEndpoint}/api/data/v9.2/botcomponents?$select=botcomponentid,name,description&$filter=${encodeURIComponent(
    filter,
  )}`;
}

/** Plan PATCH operations for every uploaded-file knowledge mirror under an agent folder. */
export async function planKnowledgeDescriptions(
  agentFolder: string,
): Promise<KnowledgeDescriptionPlan> {
  const conn = await readConnInfo(agentFolder);
  const yamlPaths = await listMirrorYamlFiles(agentFolder);
  const warnings: string[] = [];
  const entries: KnowledgeDescriptionPlanEntry[] = [];

  for (const yamlPath of yamlPaths) {
    let content: string;
    try {
      content = await fs.readFile(yamlPath, "utf8");
    } catch (err) {
      warnings.push(
        `Skipped ${yamlPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }
    entries.push(planEntryFromYaml(yamlPath, content, conn));
  }

  return {
    agentFolder,
    conn,
    entries,
    warnings,
  };
}

/**
 * Build a plan entry from a single mirror YAML's text. Exposed for testing and
 * for callers that already have the file contents loaded.
 */
export function planEntryFromYaml(
  yamlPath: string,
  content: string,
  conn: KnowledgeConnInfo,
): KnowledgeDescriptionPlanEntry {
  const componentName = extractScalar(content, "mcs.metadata", "componentName");
  const mirrorDescription = extractScalar(
    content,
    "mcs.metadata",
    "description",
  );
  const overrideDescription = extractScalar(
    content,
    "cpsAgentKit",
    "description",
  );

  const mirrorIsPlaceholder = isPlaceholderDescription(mirrorDescription);

  let description: string | undefined;
  let descriptionSource: KnowledgeDescriptionPlanEntry["descriptionSource"] =
    "mcs-metadata";
  if (overrideDescription && overrideDescription.length > 0) {
    description = overrideDescription;
    descriptionSource = "cpsAgentKit-override";
  } else if (mirrorDescription && !mirrorIsPlaceholder) {
    description = mirrorDescription;
    descriptionSource = "mcs-metadata";
  }

  let ready = true;
  let notReadyReason: KnowledgeDescriptionPlanEntry["notReadyReason"];
  if (!componentName) {
    ready = false;
    notReadyReason = "missing-component-name";
  } else if (!description) {
    ready = false;
    notReadyReason = mirrorIsPlaceholder
      ? "placeholder-description"
      : "missing-description";
  }

  const lookupUrl = componentName
    ? buildLookupUrl(conn.dataverseEndpoint, conn.agentId, componentName)
    : "";

  return {
    yamlPath,
    componentName: componentName ?? "",
    description: description ?? "",
    descriptionSource,
    mirrorIsPlaceholder,
    ready,
    notReadyReason,
    lookupRequest: { method: "GET", url: lookupUrl },
    patchRequest: {
      method: "PATCH",
      urlTemplate: `${conn.dataverseEndpoint}/api/data/v9.2/botcomponents({botComponentId})`,
      headers: { ...DEFAULT_HEADERS },
      body: { description: description ?? "" },
    },
  };
}
