import { describe, expect, it } from "vitest";
import {
  createDirectLineClient,
  getDirectLineApiVersion,
  DirectLineApiError,
} from "../../testing/directLineClient.js";

describe("DirectLineClient", () => {
  it("pins the api-version in the URL", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(typeof input === "string" ? input : input.toString());
      return new Response(JSON.stringify({ conversationId: "c1" }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const client = createDirectLineClient({
      environmentHostname: "test.example.com",
      botSchemaName: "cr_bot",
      tokenProvider: async () => "t",
      fetchImpl,
    });
    await client.createConversation();
    expect(calls[0]).toContain(`api-version=${getDirectLineApiVersion()}`);
    expect(calls[0]).toContain("/bots/cr_bot/conversations");
  });

  it("sends an empty JSON object body on createConversation (service rejects empty bodies)", async () => {
    const bodies: (BodyInit | null | undefined)[] = [];
    const fetchImpl = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      bodies.push(init?.body);
      return new Response(JSON.stringify({ conversationId: "c1" }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const client = createDirectLineClient({
      environmentHostname: "test.example.com",
      botSchemaName: "cr_bot",
      tokenProvider: async () => "t",
      fetchImpl,
    });
    await client.createConversation();
    expect(bodies[0]).toBe("{}");
  });

  it("does not retry on 401", async () => {
    let attempts = 0;
    const fetchImpl = (async () => {
      attempts++;
      return new Response("unauthorized", { status: 401 });
    }) as unknown as typeof fetch;
    const client = createDirectLineClient({
      environmentHostname: "h",
      botSchemaName: "b",
      tokenProvider: async () => "t",
      retry: { maxAttempts: 4, initialBackoffMs: 1, maxBackoffMs: 2 },
      fetchImpl,
    });
    await expect(client.createConversation()).rejects.toBeInstanceOf(
      DirectLineApiError,
    );
    expect(attempts).toBe(1);
  });

  it("retries on 5xx then succeeds", async () => {
    let attempts = 0;
    const fetchImpl = (async () => {
      attempts++;
      if (attempts < 2) {
        return new Response("boom", { status: 503 });
      }
      return new Response(JSON.stringify({ conversationId: "c-ok" }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const client = createDirectLineClient({
      environmentHostname: "h",
      botSchemaName: "b",
      tokenProvider: async () => "t",
      retry: { maxAttempts: 4, initialBackoffMs: 1, maxBackoffMs: 2 },
      fetchImpl,
    });
    const result = await client.createConversation();
    expect(result.conversationId).toBe("c-ok");
    expect(attempts).toBe(2);
  });

  it("maps LatestPublishedVersionNotFound to a clear message and does not retry", async () => {
    let attempts = 0;
    const fetchImpl = (async () => {
      attempts++;
      return new Response(
        JSON.stringify({ error: { code: "LatestPublishedVersionNotFound" } }),
        { status: 400 },
      );
    }) as unknown as typeof fetch;
    const client = createDirectLineClient({
      environmentHostname: "h",
      botSchemaName: "b",
      tokenProvider: async () => "t",
      retry: { maxAttempts: 4, initialBackoffMs: 1, maxBackoffMs: 2 },
      fetchImpl,
    });
    await expect(client.createConversation()).rejects.toThrow(
      /published version/i,
    );
    expect(attempts).toBe(1);
  });
});
