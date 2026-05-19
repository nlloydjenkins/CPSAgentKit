#!/usr/bin/env node
/**
 * scripts/push-knowledge-descriptions.mjs
 *
 * Push `botcomponent.description` values for uploaded-file knowledge sources
 * on a CPS agent up to Dataverse via the Web API.
 *
 * The official Copilot Studio VS Code extension's Apply Changes does not
 * round-trip the real description back to Dataverse — local mirror YAML at
 * `<agentFolder>/knowledge/files/<file>.mcs.yml` carries a boilerplate
 * placeholder. This script reads the same mirrors plus an explicit
 * `cpsAgentKit.description:` override at the top of the YAML (so makers can
 * keep real descriptions in source control without colliding with the
 * placeholder) and PATCHes them onto the matching `botcomponent` row.
 *
 * Auth: `az account get-access-token --resource <DataverseEndpoint>
 * --tenant <TenantId>`. Tenant must match `.mcs/conn.json#AccountInfo.TenantId`
 * or Dataverse returns 403 "The user is not a member of the organization."
 *
 * Usage:
 *   node scripts/push-knowledge-descriptions.mjs <agentFolder> [--dry-run] [--only file.md,other.md]
 *
 * Example mirror override block (recommended):
 *
 *   cpsAgentKit:
 *     description: VPN setup runbook covering split-tunnel and MFA enrolment.
 *   mcs.metadata:
 *     componentName: vpn-setup.md
 *     description: This knowledge source searches information contained in vpn-setup.md
 *   kind: KnowledgeSourceConfiguration
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const corePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "core",
  "out",
  "index.js",
);
const { planKnowledgeDescriptions } = require(corePath);

function parseArgs(argv) {
  const opts = { agentFolder: null, dryRun: false, only: null };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--only") opts.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--help" || a === "-h") opts.help = true;
    else rest.push(a);
  }
  if (rest.length > 0) opts.agentFolder = rest[0];
  return opts;
}

function help() {
  console.log(
    `push-knowledge-descriptions <agentFolder> [--dry-run] [--only file.md,other.md]\n\n` +
      `Requires the Azure CLI (\`az\`) signed in to the tenant in \`.mcs/conn.json\`.`,
  );
}

function runAz(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("az", args, { shell: process.platform === "win32" });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `az exited with code ${code}: ${stderr.trim() || stdout.trim()}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
}

async function getDataverseToken(endpoint, tenantId) {
  const out = await runAz([
    "account",
    "get-access-token",
    "--resource",
    endpoint,
    "--tenant",
    tenantId,
    "--output",
    "json",
  ]);
  const parsed = JSON.parse(out);
  if (!parsed.accessToken) {
    throw new Error("az did not return an accessToken");
  }
  return parsed.accessToken;
}

function dvHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function lookupBotComponentId(url, token) {
  const res = await fetch(url, { headers: dvHeaders(token) });
  if (!res.ok) {
    throw new Error(`Lookup failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  const rows = body.value ?? [];
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error(
      `Lookup matched ${rows.length} rows; expected 1. Refine `name` uniqueness or `_parentbotid_value` scope.`,
    );
  }
  return { id: rows[0].botcomponentid, existing: rows[0].description ?? "" };
}

async function patchDescription(urlTemplate, id, description, token) {
  const url = urlTemplate.replace("{botComponentId}", id);
  const res = await fetch(url, {
    method: "PATCH",
    headers: dvHeaders(token),
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    throw new Error(`PATCH failed: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.agentFolder) {
    help();
    process.exit(opts.help ? 0 : 1);
    return;
  }
  const agentFolder = path.resolve(opts.agentFolder);
  const plan = await planKnowledgeDescriptions(agentFolder);

  console.log(
    `Agent folder: ${plan.agentFolder}\n` +
      `Dataverse:    ${plan.conn.dataverseEndpoint}\n` +
      `Tenant:       ${plan.conn.tenantId}\n` +
      `Agent id:     ${plan.conn.agentId}\n` +
      `Entries:      ${plan.entries.length}` +
      (plan.warnings.length
        ? `\nWarnings:\n  - ${plan.warnings.join("\n  - ")}`
        : ""),
  );

  const onlyMatches = (name) =>
    !opts.only || opts.only.length === 0 || opts.only.includes(name);

  const ready = plan.entries.filter((e) => e.ready && onlyMatches(e.componentName));
  const skipped = plan.entries.filter((e) => !e.ready);
  for (const s of skipped) {
    console.warn(
      `skip ${s.componentName || s.yamlPath}: ${s.notReadyReason}`,
    );
  }
  if (ready.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (opts.dryRun) {
    for (const entry of ready) {
      console.log(
        `(dry-run) would PATCH ${entry.componentName} <- "${entry.description.slice(0, 80)}${entry.description.length > 80 ? "…" : ""}" (source: ${entry.descriptionSource})`,
      );
    }
    return;
  }

  const token = await getDataverseToken(
    plan.conn.dataverseEndpoint,
    plan.conn.tenantId,
  );

  let pushed = 0;
  let failed = 0;
  for (const entry of ready) {
    try {
      const found = await lookupBotComponentId(entry.lookupRequest.url, token);
      if (!found) {
        console.warn(
          `skip ${entry.componentName}: no botcomponent row found under agent ${plan.conn.agentId}`,
        );
        failed += 1;
        continue;
      }
      if (found.existing === entry.description) {
        console.log(`unchanged ${entry.componentName}`);
        continue;
      }
      await patchDescription(
        entry.patchRequest.urlTemplate,
        found.id,
        entry.description,
        token,
      );
      console.log(`patched ${entry.componentName}`);
      pushed += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `error ${entry.componentName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log(`\nDone. patched: ${pushed}, failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
