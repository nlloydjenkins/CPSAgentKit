#!/usr/bin/env node
// Entry point for `npx @cpsagentkit/mcp-server`.
// Supports stdio and streamable HTTP transports.

import * as http from "node:http";
import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { MCP_SERVER_VERSION } from "./index.js";
import { createServer } from "./server.js";

interface CliOptions {
  transport: "stdio" | "http";
  host: string;
  port: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    transport: "stdio",
    host: "127.0.0.1",
    port: 3333,
  };
  for (const raw of argv) {
    const [key, value] = raw.split("=");
    switch (key) {
      case "--transport":
        if (value !== "stdio" && value !== "http") {
          throw new Error(`Unsupported transport: ${value}`);
        }
        opts.transport = value;
        break;
      case "--host":
        if (value) opts.host = value;
        break;
      case "--port":
        if (value) opts.port = Number(value);
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }
  if (Number.isNaN(opts.port) || opts.port <= 0 || opts.port > 65535) {
    throw new Error(`Invalid --port value: ${opts.port}`);
  }
  return opts;
}

function printHelp(): void {
  process.stdout.write(
    [
      `cpsagentkit-mcp ${MCP_SERVER_VERSION}`,
      "",
      "Usage:",
      "  cpsagentkit-mcp [--transport=stdio|http] [--host=127.0.0.1] [--port=3333]",
      "",
      "Transports:",
      "  stdio  Default. Use for local MCP clients (Claude Desktop, Cursor, etc.).",
      "  http   Streamable HTTP transport on the given host/port.",
      "",
    ].join("\n"),
  );
}

async function runStdio(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server keeps the process alive via the transport; nothing more to do.
  console.error(`cpsagentkit-mcp ${MCP_SERVER_VERSION} listening on stdio`);
}

async function runHttp(host: string, port: number): Promise<void> {
  const server = await createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found. MCP endpoint is /mcp.");
      return;
    }
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Internal error: ${message}`);
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => resolve());
  });
  console.error(
    `cpsagentkit-mcp ${MCP_SERVER_VERSION} listening on http://${host}:${port}/mcp`,
  );
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.transport === "stdio") {
    await runStdio();
  } else {
    await runHttp(opts.host, opts.port);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
