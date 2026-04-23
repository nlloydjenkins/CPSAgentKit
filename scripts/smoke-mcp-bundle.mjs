#!/usr/bin/env node
// Smoke-test the bundled MCP server at dist/bin.js
import { spawn } from "node:child_process";
import { once } from "node:events";

const server = spawn(
  process.execPath,
  ["packages/mcp-server/dist/bin.js", "--transport=stdio"],
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
      // ignore
    }
  }
});

function send(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function notify(method, params) {
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

try {
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-bundle", version: "0.0.0" },
  });
  console.log("bundle initialize →", JSON.stringify(init.result?.serverInfo));
  notify("notifications/initialized", {});
  const tools = await send("tools/list", {});
  console.log(
    "bundle tools →",
    (tools.result?.tools ?? []).length,
    "tools registered",
  );
  const get = await send("tools/call", {
    name: "cps_get_knowledge",
    arguments: { slug: "constraints" },
  });
  console.log(
    "bundle cps_get_knowledge(constraints) → bytes =",
    (get.result?.content?.[0]?.text ?? "").length,
  );
} finally {
  server.stdin.end();
  await once(server, "exit");
}
