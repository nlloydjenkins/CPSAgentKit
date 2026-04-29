#!/usr/bin/env node
/**
 * scripts/prompt-sync.mjs
 *
 * Pull and push CPS prompt-tool instruction text between Dataverse and the
 * local workspace.
 *
 * Local files live under `prompt-text/<slug>.md` (slug = the prompt tool's
 * `name` column). Each file is the concatenated `prompt` segments separated
 * by `--- role: <role> ---` fences so segment boundaries survive a round-trip.
 *
 * Headless / CI use case. Auth: service-principal (client credentials flow)
 * via the Dataverse Web API. The MCP server-driven flow (Build Agent +
 * Dataverse MCP) does NOT use this script — it lives at
 * `cps_parse_prompt_config` / `cps_build_prompt_update` instead.
 *
 * Usage:
 *   node scripts/prompt-sync.mjs pull --out prompt-text/
 *   node scripts/prompt-sync.mjs push --in  prompt-text/
 *   node scripts/prompt-sync.mjs push --in  prompt-text/ --dry-run
 *   node scripts/prompt-sync.mjs push --in  prompt-text/ --only my-prompt-tool
 *
 * Environment variables (all required for both pull and push):
 *   DATAVERSE_URL          e.g. https://contoso.crm.dynamics.com
 *   DATAVERSE_TENANT_ID
 *   DATAVERSE_CLIENT_ID
 *   DATAVERSE_CLIENT_SECRET
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// Load the compiled core helpers — same logic the MCP tools use.
const corePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "core",
  "out",
  "index.js",
);
const { parsePromptConfig, buildPromptUpdate } = require(corePath);

const SEGMENT_FENCE = /^--- role: (.+?) ---$/;

function parseArgs(argv) {
  const opts = { _cmd: argv[0], dryRun: false, only: null };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--in" || a === "--out") opts[a.slice(2)] = argv[++i];
    else if (a === "--only") opts.only = argv[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--help" || a === "-h") opts.help = true;
  }
  return opts;
}

function help() {
  console.log(`prompt-sync

  pull --out <dir>          Pull all prompt tools to <dir>/<slug>.md
  push --in  <dir>          Push edited <dir>/<slug>.md back to Dataverse
       [--only <slug>]      Limit push to one tool
       [--dry-run]          Show planned changes without PATCHing

Environment:
  DATAVERSE_URL, DATAVERSE_TENANT_ID, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET
`);
}

function requireEnv() {
  const need = [
    "DATAVERSE_URL",
    "DATAVERSE_TENANT_ID",
    "DATAVERSE_CLIENT_ID",
    "DATAVERSE_CLIENT_SECRET",
  ];
  const missing = need.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
  return {
    url: process.env.DATAVERSE_URL.replace(/\/+$/, ""),
    tenantId: process.env.DATAVERSE_TENANT_ID,
    clientId: process.env.DATAVERSE_CLIENT_ID,
    clientSecret: process.env.DATAVERSE_CLIENT_SECRET,
  };
}

async function getAccessToken({ tenantId, clientId, clientSecret, url }) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${url}/.default`,
    grant_type: "client_credentials",
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token;
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

async function listPromptTools(env, token) {
  // We list rows that have a non-empty msdyn_customconfiguration. The exact
  // filter for "prompt-tool kind" varies by environment; callers can tighten
  // this with a $filter if their schema differs.
  const url = `${env.url}/api/data/v9.2/msdyn_aiconfigurations?$select=msdyn_aiconfigurationid,msdyn_name,msdyn_customconfiguration&$filter=msdyn_customconfiguration ne null`;
  const res = await fetch(url, { headers: dvHeaders(token) });
  if (!res.ok) {
    throw new Error(`List failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.value;
}

async function patchPromptTool(env, token, id, customConfiguration) {
  const url = `${env.url}/api/data/v9.2/msdyn_aiconfigurations(${id})`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: dvHeaders(token),
    body: JSON.stringify({ msdyn_customconfiguration: customConfiguration }),
  });
  if (!res.ok) {
    throw new Error(`PATCH failed: ${res.status} ${await res.text()}`);
  }
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function segmentsToMarkdown(prompts) {
  return prompts
    .map((p) => `--- role: ${p.role} ---\n\n${p.content.trimEnd()}\n`)
    .join("\n");
}

function markdownToSegments(text) {
  const lines = text.split(/\r?\n/);
  const segments = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(SEGMENT_FENCE);
    if (m) {
      if (current) segments.push(current);
      current = { role: m[1].trim(), content: "" };
    } else if (current) {
      current.content += (current.content ? "\n" : "") + line;
    }
    // lines before the first fence are silently dropped (e.g. front matter).
  }
  if (current) segments.push(current);
  return segments.map((s) => ({
    role: s.role,
    content: s.content.replace(/^\n+/, "").replace(/\n+$/, ""),
  }));
}

async function cmdPull(opts) {
  if (!opts.out) throw new Error("Missing --out <dir>");
  const env = requireEnv();
  const token = await getAccessToken(env);
  const rows = await listPromptTools(env, token);
  await fs.mkdir(opts.out, { recursive: true });
  for (const row of rows) {
    const slug = slugify(row.msdyn_name);
    let parsed;
    try {
      parsed = parsePromptConfig(row.msdyn_customconfiguration);
    } catch (err) {
      console.warn(`skip ${row.msdyn_name}: ${err.message}`);
      continue;
    }
    const target = path.join(opts.out, `${slug}.md`);
    const body =
      `<!-- DO NOT EDIT this header. Slug "${slug}" maps to msdyn_aiconfigurationid ${row.msdyn_aiconfigurationid}. -->\n\n` +
      segmentsToMarkdown(parsed.prompts);
    await fs.writeFile(target, body, "utf8");
    console.log(
      `pulled ${slug} → ${target}  (${parsed.prompts.length} segments, placeholders: ${parsed.placeholders.join(", ") || "(none)"})`,
    );
  }
}

async function cmdPush(opts) {
  if (!opts.in) throw new Error("Missing --in <dir>");
  const env = requireEnv();
  const token = await getAccessToken(env);
  const rows = await listPromptTools(env, token);
  const byId = new Map(rows.map((r) => [r.msdyn_aiconfigurationid, r]));
  const files = (await fs.readdir(opts.in)).filter((f) => f.endsWith(".md"));
  let pushed = 0;
  let failed = 0;
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    if (opts.only && opts.only !== slug) continue;
    const fullPath = path.join(opts.in, file);
    const text = await fs.readFile(fullPath, "utf8");
    const idMatch = text.match(/msdyn_aiconfigurationid\s+([0-9a-f-]{36})/i);
    if (!idMatch) {
      console.warn(`skip ${slug}: file missing msdyn_aiconfigurationid header`);
      failed += 1;
      continue;
    }
    const row = byId.get(idMatch[1]);
    if (!row) {
      console.warn(`skip ${slug}: id ${idMatch[1]} not in current environment`);
      failed += 1;
      continue;
    }
    const newPrompts = markdownToSegments(text);
    const result = buildPromptUpdate({
      originalCustomConfiguration: row.msdyn_customconfiguration,
      newPrompts,
    });
    if (!result.validation.ok) {
      console.error(`refuse ${slug}: ${result.validation.errors.join("; ")}`);
      failed += 1;
      continue;
    }
    if (result.validation.warnings.length) {
      console.warn(`warn ${slug}: ${result.validation.warnings.join("; ")}`);
    }
    if (opts.dryRun) {
      console.log(
        `(dry-run) would push ${slug}  (${result.validation.segmentCountAfter} segments)`,
      );
    } else {
      await patchPromptTool(
        env,
        token,
        row.msdyn_aiconfigurationid,
        result.newCustomConfiguration,
      );
      console.log(`pushed ${slug}`);
    }
    pushed += 1;
  }
  console.log(
    `\nDone. ${opts.dryRun ? "would push" : "pushed"}: ${pushed}, failed: ${failed}`,
  );
  if (failed > 0) process.exit(1);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts._cmd || opts._cmd === "--help" || opts._cmd === "-h") {
    help();
    return;
  }
  if (opts._cmd === "pull") return cmdPull(opts);
  if (opts._cmd === "push") return cmdPush(opts);
  help();
  process.exit(1);
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
