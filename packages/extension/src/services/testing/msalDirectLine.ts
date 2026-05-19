// MSAL-based Direct Line token provider for the CPS Dataverse-backed API.
//
// VS Code's built-in "microsoft" auth provider uses a first-party clientId
// that is NOT pre-authorised for the Power Platform API's
// CopilotStudio.Copilots.Invoke delegated permission. To obtain a token
// with the correct `scp` claim we must use the user's own Entra app
// registration (with that permission granted + admin consent).
//
// We use MSAL Node's PublicClientApplication with a device-code flow,
// persisting the MSAL serialised token cache in `vscode.SecretStorage` so
// subsequent runs refresh silently.
import * as vscode from "vscode";
import {
  PublicClientApplication,
  type Configuration,
  type AuthenticationResult,
  type ICachePlugin,
  type TokenCacheContext,
  type DeviceCodeRequest,
} from "@azure/msal-node";
import type { TokenProvider } from "@cpsagentkit/core";
import { logInfo, logError } from "./diagnostics.js";

const DIRECT_LINE_SCOPE =
  "https://api.powerplatform.com/CopilotStudio.Copilots.Invoke";

export interface MsalDirectLineOptions {
  clientId: string;
  tenantId: string;
  secrets: vscode.SecretStorage;
}

export function msalCacheKey(tenantId: string, clientId: string): string {
  return `cpsagentkit.msal.cache.${tenantId}.${clientId}`;
}

export function createMsalDirectLineTokenProvider(
  opts: MsalDirectLineOptions,
): TokenProvider {
  const cacheKey = msalCacheKey(opts.tenantId, opts.clientId);
  const cachePlugin: ICachePlugin = {
    async beforeCacheAccess(ctx: TokenCacheContext): Promise<void> {
      const blob = await opts.secrets.get(cacheKey);
      if (blob) {
        ctx.tokenCache.deserialize(blob);
      }
    },
    async afterCacheAccess(ctx: TokenCacheContext): Promise<void> {
      if (ctx.cacheHasChanged) {
        await opts.secrets.store(cacheKey, ctx.tokenCache.serialize());
      }
    },
  };

  const config: Configuration = {
    auth: {
      clientId: opts.clientId,
      authority: `https://login.microsoftonline.com/${opts.tenantId}`,
    },
    cache: { cachePlugin },
  };
  const pca = new PublicClientApplication(config);

  let inFlight: Promise<string> | undefined;
  let cachedToken: { value: string; expiresAt: number } | undefined;

  async function acquireOnce(): Promise<string> {
    // 1. Try silent acquisition from any cached account.
    try {
      const accounts = await pca.getTokenCache().getAllAccounts();
      if (accounts.length > 0) {
        const result = await pca.acquireTokenSilent({
          account: accounts[0],
          scopes: [DIRECT_LINE_SCOPE],
        });
        if (result?.accessToken) {
          return result.accessToken;
        }
      }
    } catch (err) {
      logInfo(
        `MSAL silent acquisition failed, falling back to device code: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // 2. Device-code flow (user-interactive).
    const result = await deviceCode(pca);
    if (!result?.accessToken) {
      throw new Error(
        "Direct Line sign-in did not return an access token. Re-run the command to retry.",
      );
    }
    return result.accessToken;
  }

  return async () => {
    // Reuse a cached token across the entire test run so we never re-prompt.
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
      return cachedToken.value;
    }
    // Single-flight: concurrent scenario calls share one in-flight acquisition
    // so the user only sees ONE device-code prompt per run.
    if (!inFlight) {
      inFlight = acquireOnce().then((token) => {
        // MSAL access tokens are JWTs; decode `exp` for caching.
        let expiresAt = Date.now() + 30 * 60_000; // safe default 30 min
        try {
          const payload = JSON.parse(
            Buffer.from(
              token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
              "base64",
            ).toString("utf-8"),
          ) as { exp?: number };
          if (typeof payload.exp === "number") {
            expiresAt = payload.exp * 1000;
          }
        } catch {
          /* fall back to default expiry */
        }
        cachedToken = { value: token, expiresAt };
        return token;
      });
      inFlight.finally(() => {
        // Clear in-flight so a future expiry can re-acquire. The cachedToken
        // check above prevents redundant prompts while the token is still
        // valid.
        setTimeout(() => {
          inFlight = undefined;
        }, 1000);
      });
    }
    return inFlight;
  };
}

// Module-level mutex: ensures we only ever surface ONE device-code prompt at
// a time, even across multiple TokenProvider instances or MSAL retries. If
// the callback fires while a prompt is already open, the new prompt waits
// (so the user never sees two dialogs with two different codes).
let activePrompt: Promise<void> = Promise.resolve();

function collectAllStringProps(obj: unknown): Record<string, string> {
  // Walk own + prototype properties so we still find the code if MSAL ever
  // ships a class instance with non-enumerable accessors.
  const out: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return out;
  const seen = new Set<string>();
  let cur: object | null = obj as object;
  while (cur && cur !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(cur)) {
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const val = (obj as Record<string, unknown>)[key];
        if (typeof val === "string") out[key] = val;
      } catch {
        /* ignore inaccessible accessor */
      }
    }
    cur = Object.getPrototypeOf(cur);
  }
  return out;
}

function extractCodeAndUrl(raw: Record<string, unknown>): {
  code: string;
  url: string;
  message: string;
  rawDump: string;
} {
  const props = collectAllStringProps(raw);
  const rawDump = JSON.stringify(props);
  const message = props.message ?? "";

  // Direct field lookup across known variants first.
  let code: string | undefined =
    props.userCode ?? props.user_code ?? props.deviceCode ?? props.device_code;
  let url: string | undefined =
    props.verificationUriComplete ??
    props.verification_uri_complete ??
    props.verificationUri ??
    props.verification_uri;

  // Parse out of the human-readable message string (MSAL always provides it).
  if (!code) {
    const m = message.match(/code\s+([A-Z0-9][A-Z0-9-]{3,})/i);
    if (m) code = m[1];
  }
  if (!url) {
    const m = message.match(/https?:\/\/\S+/);
    if (m) url = m[0].replace(/[.,;]$/, "");
  }

  // Last-ditch: scan every string property for a token-shaped value.
  if (!code) {
    for (const [k, v] of Object.entries(props)) {
      if (
        k === "message" ||
        k === "verificationUri" ||
        k === "verification_uri"
      )
        continue;
      if (/^[A-Z0-9][A-Z0-9-]{4,12}$/.test(v)) {
        code = v;
        break;
      }
    }
  }

  return {
    code: code ?? "(unknown)",
    url: url ?? "https://microsoft.com/devicelogin",
    message:
      message ||
      `To sign in, open ${url ?? "https://microsoft.com/devicelogin"} and enter the code ${code ?? ""}.`,
    rawDump,
  };
}

async function deviceCode(
  pca: PublicClientApplication,
): Promise<AuthenticationResult | null> {
  const channel = (await import("./diagnostics.js")).getTestingChannel();
  const request: DeviceCodeRequest = {
    scopes: [DIRECT_LINE_SCOPE],
    deviceCodeCallback: (info: unknown) => {
      const raw = (info ?? {}) as Record<string, unknown>;
      const { code, url, message, rawDump } = extractCodeAndUrl(raw);

      channel.appendLine(`[${new Date().toISOString()}] ${message}`);
      channel.appendLine(
        `[${new Date().toISOString()}] Raw device-code payload: ${rawDump}`,
      );

      const codeKnown = code !== "(unknown)";
      if (!codeKnown) {
        // Empty / malformed payload from MSAL means the upstream device-code
        // endpoint call failed. Don't ask the user to sign in with a missing
        // code — the surrounding acquireTokenByDeviceCode will throw the real
        // error and we surface that instead.
        channel.appendLine(
          `[${new Date().toISOString()}] Suppressing device-code prompt: payload had no code (likely upstream network/auth failure).`,
        );
        return;
      }

      const dialogBody = `CPSAgentKit: sign in to Direct Line.\n\nCode (copied to clipboard): ${code}\n\nA browser tab has opened to ${url}. Paste the code there, sign in, then click OK below.`;

      // Serialize prompts so the user only ever sees ONE dialog at a time.
      // We chain onto the existing activePrompt so concurrent callbacks queue.
      activePrompt = activePrompt
        .catch(() => undefined)
        .then(async () => {
          try {
            await vscode.env.clipboard.writeText(code);
          } catch {
            /* clipboard may be unavailable in some hosts */
          }
          try {
            await vscode.env.openExternal(vscode.Uri.parse(url));
          } catch {
            /* opening external is best-effort */
          }
          await vscode.window.showInformationMessage(
            dialogBody,
            { modal: true },
            "OK",
          );
        });
      void activePrompt;
    },
  };

  try {
    return await pca.acquireTokenByDeviceCode(request);
  } catch (err) {
    // Dump everything MSAL gives us so a generic "post_request_failed" doesn't
    // hide the real cause (invalid_grant, AADSTS codes, network status, etc).
    const detail = err as Record<string, unknown> | undefined;
    const dump = {
      name: detail?.name,
      message: detail?.message,
      errorCode: detail?.errorCode,
      errorMessage: detail?.errorMessage,
      subError: detail?.subError,
      correlationId: detail?.correlationId,
      stack: typeof detail?.stack === "string" ? detail.stack : undefined,
    };
    channel.appendLine(
      `[${new Date().toISOString()}] MSAL device-code error: ${JSON.stringify(
        dump,
      )}`,
    );
    logError("MSAL device-code acquisition failed", err);
    throw err;
  }
}
