#!/usr/bin/env node
// Smoke test: spawn the MCP stdio server, run initialize + tools/list + a
// couple of tool calls, print results, exit.
import { spawn } from "node:child_process";
import { once } from "node:events";

const server = spawn(
  process.execPath,
  ["packages/mcp-server/out/bin.js", "--transport=stdio"],
  { stdio: ["pipe", "pipe", "inherit"] },
);

const pending = new Map();
let nextId = 1;
let buffer = "";

server.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    } catch {
      // ignore non-JSON lines
    }
  }
});

function send(method, params) {
  const id = nextId++;
  const payload = { jsonrpc: "2.0", id, method, params };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    server.stdin.write(JSON.stringify(payload) + "\n");
  });
}

function notify(method, params) {
  server.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n",
  );
}

try {
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.0" },
  });
  console.log("initialize →", JSON.stringify(init.result?.serverInfo));

  notify("notifications/initialized", {});

  const tools = await send("tools/list", {});
  console.log(
    "tools/list →",
    (tools.result?.tools ?? []).map((t) => t.name).join(", "),
  );

  const list = await send("tools/call", {
    name: "cps_list_knowledge_topics",
    arguments: { category: "knowledge" },
  });
  const parsed = JSON.parse(list.result?.content?.[0]?.text ?? "[]");
  console.log("cps_list_knowledge_topics (knowledge) → count =", parsed.length);
  console.log("  first slug:", parsed[0]?.slug);

  const get = await send("tools/call", {
    name: "cps_get_knowledge",
    arguments: { slug: "constraints" },
  });
  const body = get.result?.content?.[0]?.text ?? "";
  console.log(
    "cps_get_knowledge(constraints) → bytes =",
    body.length,
    "preview:",
    body.slice(0, 60).replace(/\s+/g, " "),
  );

  const resources = await send("resources/list", {});
  console.log(
    "resources/list → count =",
    (resources.result?.resources ?? []).length,
  );

  const validateGood = await send("tools/call", {
    name: "cps_validate_tool_description",
    arguments: {
      description:
        "Retrieves customer orders from Dataverse. Use this when the user asks about order history, invoices, or payment status for a named customer. Takes a customerId (GUID) as input and returns up to 50 recent orders ordered by date. Do not use this for product catalogue queries.",
      kind: "tool",
    },
  });
  const goodResult = JSON.parse(
    validateGood.result?.content?.[0]?.text ?? "{}",
  );
  console.log(
    "cps_validate_tool_description (good) → ok =",
    goodResult.ok,
    "issues =",
    goodResult.issues?.length,
  );

  const validateBad = await send("tools/call", {
    name: "cps_validate_tool_description",
    arguments: {
      description: "Helps with customer stuff.",
      kind: "tool",
    },
  });
  const badResult = JSON.parse(validateBad.result?.content?.[0]?.text ?? "{}");
  console.log(
    "cps_validate_tool_description (vague) → ok =",
    badResult.ok,
    "issues =",
    badResult.issues?.length,
    "severities:",
    badResult.issues?.map((i) => i.severity).join(","),
  );

  // Detect project state of this repo itself
  const projectState = await send("tools/call", {
    name: "cps_detect_project_state",
    arguments: { workspaceRoot: process.cwd() },
  });
  const stateBody = JSON.parse(
    projectState.result?.content?.[0]?.text ?? "{}",
  );
  console.log(
    "cps_detect_project_state → isInitialised =",
    stateBody.isInitialised,
    "agents =",
    stateBody.agentFolders?.length,
  );
} finally {
  server.stdin.end();
  await once(server, "exit");
}
