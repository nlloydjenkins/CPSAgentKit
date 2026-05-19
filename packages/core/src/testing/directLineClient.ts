// Dataverse-backed Direct Line client with bounded retry.
// API version is pinned here (see LLD §6.1) — do not move to user config.
import type {
  DirectLineActivity,
  DirectLineClient,
  DirectLineClientOptions,
  DirectLineTurnResult,
  RetryPolicy,
  SendTurnInput,
} from "./types.js";

const DIRECT_LINE_API_VERSION = "2022-03-01-preview";
const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 4,
  initialBackoffMs: 500,
  maxBackoffMs: 8000,
};

const NON_RETRYABLE_BODY_MARKERS = ["LatestPublishedVersionNotFound"];

export class DirectLineApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = "DirectLineApiError";
  }
}

export function getDirectLineApiVersion(): string {
  return DIRECT_LINE_API_VERSION;
}

export function createDirectLineClient(
  options: DirectLineClientOptions,
): DirectLineClient {
  return new DirectLineClientImpl(options);
}

class DirectLineClientImpl implements DirectLineClient {
  private readonly hostname: string;
  private readonly botSchemaName: string;
  private readonly retry: RetryPolicy;
  private readonly fetchImpl: typeof fetch;
  private readonly tokenProvider: () => Promise<string>;

  constructor(options: DirectLineClientOptions) {
    this.hostname = options.environmentHostname
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    this.botSchemaName = options.botSchemaName;
    this.retry = options.retry ?? DEFAULT_RETRY;
    this.tokenProvider = options.tokenProvider;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private url(conversationId?: string): string {
    const base = `https://${this.hostname}/copilotstudio/dataverse-backed/authenticated/bots/${this.botSchemaName}/conversations`;
    const suffix = conversationId ? `/${conversationId}` : "";
    return `${base}${suffix}?api-version=${DIRECT_LINE_API_VERSION}`;
  }

  async createConversation(): Promise<{ conversationId: string }> {
    const response = await this.request<{
      conversationId?: string;
      id?: string;
    }>("POST", this.url(), undefined);
    const id = response.conversationId ?? response.id;
    if (!id) {
      throw new DirectLineApiError(
        "Direct Line createConversation response did not include a conversation id.",
      );
    }
    return { conversationId: id };
  }

  async sendTurn(input: SendTurnInput): Promise<DirectLineTurnResult> {
    const payload = {
      activity: {
        type: "message",
        text: input.text,
      },
    };
    const raw = await this.request<{ activities?: DirectLineActivity[] }>(
      "POST",
      this.url(input.conversationId),
      payload,
      input.timeoutMs,
    );
    return {
      activities: raw.activities ?? [],
      raw,
    };
  }

  private async request<T>(
    method: "POST" | "GET",
    url: string,
    body?: unknown,
    timeoutMs?: number,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt++) {
      try {
        const token = await this.tokenProvider();
        const controller = new AbortController();
        const timer = timeoutMs
          ? setTimeout(() => controller.abort(), timeoutMs)
          : undefined;
        let response: Response;
        try {
          response = await this.fetchImpl(url, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
          });
        } finally {
          if (timer) {
            clearTimeout(timer);
          }
        }

        if (response.ok) {
          const text = await response.text();
          if (!text) {
            return {} as T;
          }
          try {
            return JSON.parse(text) as T;
          } catch {
            const snippet = text.slice(0, 200).replace(/\s+/g, " ");
            throw new DirectLineApiError(
              `Direct Line response was not JSON. URL=${url} body starts with: ${snippet}`,
              response.status,
              undefined,
              text,
            );
          }
        }

        const bodyText = await safeText(response);
        const requestId =
          response.headers.get("x-ms-request-id") ??
          response.headers.get("x-request-id") ??
          response.headers.get("request-id");
        const retryable = isRetryableHttp(response.status, bodyText);
        if (!retryable || attempt === this.retry.maxAttempts) {
          throw new DirectLineApiError(
            mapStatusMessage(response.status, bodyText, url, requestId),
            response.status,
            extractCode(bodyText),
            bodyText,
          );
        }
        await sleep(
          computeBackoff(
            attempt,
            this.retry,
            response.headers.get("retry-after"),
          ),
        );
      } catch (err) {
        lastError = err;
        if (err instanceof DirectLineApiError) {
          if (err.status && !isRetryableHttp(err.status, err.responseBody)) {
            throw err;
          }
          if (attempt === this.retry.maxAttempts) {
            throw err;
          }
        } else if (isAbortOrNetwork(err)) {
          if (attempt === this.retry.maxAttempts) {
            throw wrapNetworkError(err);
          }
        } else {
          throw err;
        }
        await sleep(computeBackoff(attempt, this.retry));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new DirectLineApiError("Direct Line request failed after retries.");
  }
}

function isRetryableHttp(status: number, bodyText?: string): boolean {
  if (status === 429) {
    return true;
  }
  if (status >= 500 && status < 600) {
    return true;
  }
  if (
    bodyText &&
    NON_RETRYABLE_BODY_MARKERS.some((m) => bodyText.includes(m))
  ) {
    return false;
  }
  return false;
}

function isAbortOrNetwork(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    const code = (err as Error & { code?: string }).code;
    if (code && /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH/.test(code)) {
      return true;
    }
    if (/fetch failed|network/i.test(err.message)) return true;
  }
  return false;
}

function wrapNetworkError(err: unknown): DirectLineApiError {
  const message = err instanceof Error ? err.message : String(err);
  return new DirectLineApiError(`Direct Line network error: ${message}`);
}

function computeBackoff(
  attempt: number,
  retry: RetryPolicy,
  retryAfterHeader?: string | null,
): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, retry.maxBackoffMs);
    }
  }
  const exp = Math.min(
    retry.initialBackoffMs * 2 ** (attempt - 1),
    retry.maxBackoffMs,
  );
  return Math.floor(Math.random() * exp);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function extractCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body);
    const code = parsed?.error?.code ?? parsed?.code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

function mapStatusMessage(
  status: number,
  body: string,
  url?: string,
  requestId?: string | null,
): string {
  if (body.includes("LatestPublishedVersionNotFound")) {
    return "Direct Line: agent has no published version. In Copilot Studio, choose Publish (or Apply changes) for this agent and try again.";
  }
  const suffix = [
    url ? `URL=${url}` : undefined,
    requestId ? `request-id=${requestId}` : undefined,
    body ? `body=${body.slice(0, 500)}` : "body=(empty)",
  ]
    .filter(Boolean)
    .join(" | ");
  switch (status) {
    case 401:
      return `Direct Line: authentication failed (401). The access token is missing or expired. ${suffix}`;
    case 403:
      return `Direct Line: forbidden (403). Confirm the app registration has CopilotStudio.Copilots.Invoke and admin consent in this tenant. ${suffix}`;
    case 404:
      return `Direct Line: not found (404). Verify the Power Platform API hostname and bot schema name. ${suffix}`;
    case 413:
      return `Direct Line: payload too large. Reduce input size or return links instead of inline content. ${suffix}`;
    default:
      return `Direct Line request failed with status ${status}. ${suffix}`;
  }
}
