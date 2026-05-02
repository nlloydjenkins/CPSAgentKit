import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import type * as http from "node:http";
import { MAX_BODY_BYTES, isHttpClientError, readJsonBody } from "../bin.js";

function requestWithBody(
  body: string | Buffer,
  contentType?: string,
): http.IncomingMessage {
  const req = Readable.from([body]) as http.IncomingMessage;
  req.headers = {};
  if (contentType !== undefined) {
    req.headers["content-type"] = contentType;
  }
  return req;
}

describe("readJsonBody", () => {
  it("parses application/json bodies", async () => {
    await expect(
      readJsonBody(
        requestWithBody('{"method":"initialize"}', "application/json"),
      ),
    ).resolves.toEqual({ method: "initialize" });
  });

  it("accepts application/json with parameters", async () => {
    await expect(
      readJsonBody(
        requestWithBody('{"jsonrpc":"2.0"}', "application/json; charset=utf-8"),
      ),
    ).resolves.toEqual({ jsonrpc: "2.0" });
  });

  it("rejects missing content type", async () => {
    await expect(readJsonBody(requestWithBody("{}"))).rejects.toThrow(
      "Unsupported Content-Type",
    );
  });

  it("rejects non-json content type", async () => {
    await expect(
      readJsonBody(requestWithBody("{}", "text/plain")),
    ).rejects.toThrow("Unsupported Content-Type");
  });

  it("rejects malformed json-ish content type", async () => {
    await expect(
      readJsonBody(requestWithBody("{}", "application/jsonx")),
    ).rejects.toThrow("Unsupported Content-Type");
  });

  it("rejects bodies over the limit", async () => {
    await expect(
      readJsonBody(
        requestWithBody(Buffer.alloc(MAX_BODY_BYTES + 1), "application/json"),
      ),
    ).rejects.toThrow("Request body too large");
  });

  it("maps only expected request errors as client errors", () => {
    expect(isHttpClientError(new Error("Invalid JSON body"))).toBe(true);
    expect(isHttpClientError(new Error("boom"))).toBe(false);
  });
});
