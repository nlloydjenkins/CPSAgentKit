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

export const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB

export async function readJsonBody(
  req: http.IncomingMessage,
): Promise<unknown> {
  const contentTypeHeader = req.headers["content-type"];
  const contentType = Array.isArray(contentTypeHeader)
    ? contentTypeHeader[0]
    : contentTypeHeader;
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new Error("Unsupported Content-Type; expected application/json");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error("Request body too large");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function isHttpClientError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message === "Request body too large" ||
      err.message === "Invalid JSON body" ||
      err.message.startsWith("Unsupported Content-Type"))
  );
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
  // One transport (and server) per MCP session, keyed by mcp-session-id.
  // Clients call POST /mcp with method=initialize (no session header) to
  // create a session; the response carries an mcp-session-id header which
  // they must echo on every subsequent request. GET /mcp opens the SSE
  // stream for that session. DELETE /mcp tears it down.
  const transports = new Map<string, StreamableHTTPServerTransport>();

  function isInitializeRequest(body: unknown): boolean {
    if (!body || typeof body !== "object") return false;
    const msg = body as { method?: unknown };
    return msg.method === "initialize";
  }

  async function createSessionTransport(): Promise<StreamableHTTPServerTransport> {
    const server = await createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };
    await server.connect(transport);
    return transport;
  }

  const httpServer = http.createServer(async (req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found. MCP endpoint is /mcp.");
      return;
    }

    const sessionId = req.headers["mcp-session-id"];
    const sessionIdStr = Array.isArray(sessionId) ? sessionId[0] : sessionId;

    try {
      if (req.method === "POST") {
        const body = await readJsonBody(req);
        let transport: StreamableHTTPServerTransport | undefined;

        if (sessionIdStr) {
          transport = transports.get(sessionIdStr);
          if (!transport) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32001, message: "Unknown session" },
                id: null,
              }),
            );
            return;
          }
        } else if (isInitializeRequest(body)) {
          transport = await createSessionTransport();
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32600,
                message:
                  "Bad Request: missing mcp-session-id header (call initialize first)",
              },
              id: null,
            }),
          );
          return;
        }

        await transport.handleRequest(req, res, body);
        return;
      }

      // GET (open SSE) and DELETE (terminate session) require an existing session.
      if (req.method === "GET" || req.method === "DELETE") {
        if (!sessionIdStr) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing mcp-session-id header");
          return;
        }
        const transport = transports.get(sessionIdStr);
        if (!transport) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Unknown session");
          return;
        }
        await transport.handleRequest(req, res);
        return;
      }

      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method not allowed");
    } catch (err) {
      // Never expose internal error details to the network client
      const isClientError = isHttpClientError(err);
      if (!res.headersSent) {
        if (isClientError) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end(err instanceof Error ? err.message : "Bad request");
        } else {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Internal server error");
        }
      } else {
        res.end();
      }
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

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
