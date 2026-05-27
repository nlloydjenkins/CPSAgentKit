// HTTP wrapper for discovery calls. Throws DiscoveryError with a remediation hint.
import type { TokenProvider } from "@agent-workbench/core";

export interface ReconfigureHint {
  step:
    | "tenant"
    | "environment"
    | "agent"
    | "auth"
    | "judge"
    | "subscription"
    | "openAIAccount"
    | "deployment";
  message: string;
}

export class DiscoveryError extends Error {
  constructor(
    message: string,
    public readonly reconfigureHint: ReconfigureHint,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DiscoveryError";
  }
}

export async function getJson<T>(
  url: string,
  tokenProvider: TokenProvider,
  hint: ReconfigureHint,
): Promise<T> {
  let token: string;
  try {
    token = await tokenProvider();
  } catch (err) {
    throw new DiscoveryError(`Sign-in required: ${(err as Error).message}`, {
      step: "auth",
      message: "Sign in to Microsoft to continue.",
    });
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new DiscoveryError(
      `${url} failed (${response.status}): ${body.slice(0, 400)}`,
      hint,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export async function pagedValues<T>(
  url: string,
  tokenProvider: TokenProvider,
  hint: ReconfigureHint,
  maxPages = 10,
): Promise<T[]> {
  const all: T[] = [];
  let next: string | undefined = url;
  let page = 0;
  while (next && page < maxPages) {
    const payload: {
      value?: T[];
      nextLink?: string;
      "@odata.nextLink"?: string;
    } = await getJson(next, tokenProvider, hint);
    if (payload.value) {
      all.push(...payload.value);
    }
    next = payload.nextLink ?? payload["@odata.nextLink"];
    page++;
  }
  return all;
}
