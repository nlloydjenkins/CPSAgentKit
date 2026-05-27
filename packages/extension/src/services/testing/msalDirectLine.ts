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
import type { TokenProvider } from "@agent-workbench-for-copilot-studio/core";
import { logInfo, logError } from "./diagnostics.js";

const DIRECT_LINE_SCOPE =
  "https://api.powerplatform.com/CopilotStudio.Copilots.Invoke";

export interface MsalDirectLineOptions {
  clientId: string;
  tenantId: string;
  secrets: vscode.SecretStorage;
}

export function msalCacheKey(tenantId: string, clientId: string): string {
  return `agentWorkbench.msal.cache.${tenantId}.${clientId}`;
}

/** Legacy pre-rename cache key. Kept so existing sign-in state survives the rename. */
function legacyMsalCacheKey(tenantId: string, clientId: string): string {
  return `cpsagentkit.msal.cache.${tenantId}.${clientId}`;
}

export function createMsalDirectLineTokenProvider(
  opts: MsalDirectLineOptions,
): TokenProvider {
  const cacheKey = msalCacheKey(opts.tenantId, opts.clientId);
  const legacyKey = legacyMsalCacheKey(opts.tenantId, opts.clientId);
  const cachePlugin: ICachePlugin = {
    async beforeCacheAccess(ctx: TokenCacheContext): Promise<void> {
      let blob = await opts.secrets.get(cacheKey);
      if (!blob) {
        const legacyBlob = await opts.secrets.get(legacyKey);
        if (legacyBlob) {
          await opts.secrets.store(cacheKey, legacyBlob);
          await opts.secrets.delete(legacyKey);
          blob = legacyBlob;
        }
      }
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

      const dialogBody = `Agent Workbench: sign in to Direct Line.\n\nCode (copied to clipboard): ${code}\n\nA browser tab has opened to ${url}. Paste the code there, sign in, then click OK below.`;

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
    throw classifyDirectLineSignInError(err);
  }
}

/**
 * Marker added to errors that have already been classified with an actionable
 * Direct Line sign-in hint, so the command layer can render them as-is.
 */
export const DIRECT_LINE_SIGNIN_ERROR = Symbol.for(
  "agentWorkbench.directLineSignInError",
);

export interface DirectLineSignInError extends Error {
  [DIRECT_LINE_SIGNIN_ERROR]: true;
  /** Short error code suitable for log lines (e.g. "invalid_grant"). */
  code: string;
  /** Human-readable hint describing the most likely cause + remediation. */
  hint: string;
  /** Raw MSAL error string, preserved for the output channel. */
  raw: string;
}

export function isDirectLineSignInError(
  err: unknown,
): err is DirectLineSignInError {
  return (
    !!err &&
    typeof err === "object" &&
    (err as Record<symbol, unknown>)[DIRECT_LINE_SIGNIN_ERROR] === true
  );
}

function classifyDirectLineSignInError(err: unknown): Error {
  const detail = (err ?? {}) as Record<string, unknown>;
  const errorCode =
    typeof detail.errorCode === "string" ? detail.errorCode : "";
  const errorMessage =
    typeof detail.errorMessage === "string" ? detail.errorMessage : "";
  const message = typeof detail.message === "string" ? detail.message : "";
  const subError = typeof detail.subError === "string" ? detail.subError : "";
  const raw = [errorCode, subError, errorMessage, message]
    .filter(Boolean)
    .join(" | ");
  const lower = raw.toLowerCase();

  let code = "unknown_error";
  let hint =
    "Sign-in failed before a Direct Line token could be issued. See the 'Agent Workbench (Testing)' output channel for the full MSAL error.";

  // The /devicecode endpoint itself failed (the first POST that returns the
  // user_code, BEFORE any user interaction). This is what MSAL reports as
  // `post_request_failed` with `invalid_grant` in the response body. Clearing
  // the token cache will not help — the app registration is misconfigured.
  const deviceCodePostFailed =
    errorCode === "post_request_failed" && lower.includes("invalid_grant");

  if (deviceCodePostFailed) {
    code = "devicecode_post_failed";
    hint =
      "Microsoft Entra refused the device-code request before any sign-in could happen. This is almost always an app-registration problem, not a stale credential.\n\n" +
      "Check, in this order:\n" +
      "  1. App registration > Authentication > 'Allow public client flows' must be set to YES. (Device-code flow requires a public client.)\n" +
      "  2. Confirm the clientId and tenantId in .agent-workbench/test-config.json match the app registration in the correct tenant.\n" +
      "  3. App registration > API permissions: 'Power Platform API > CopilotStudio.Copilots.Invoke' (delegated) must be added AND admin consent granted.\n" +
      "  4. App registration > Manifest: ensure 'signInAudience' permits the tenant you're signing in from (AzureADMyOrg or AzureADMultipleOrgs as appropriate).\n\n" +
      "Only after fixing the above is 'Reset Direct Line Sign-in' useful (and only to clear any partial cache).";
  } else if (
    lower.includes("invalid_grant") ||
    lower.includes("expired_token") ||
    lower.includes("authorization_pending")
  ) {
    code = "invalid_grant";
    hint =
      "The device-code sign-in didn't complete in time, the cached refresh token was rejected, or the prompt was dismissed before you finished signing in.\n\n" +
      "Try this:\n" +
      "  1. Run 'Agent Workbench: Reset Direct Line Sign-in' to clear cached credentials.\n" +
      "  2. Re-run 'Agent Workbench: Run Agent Tests' and complete the browser sign-in promptly (the code expires in ~15 minutes).\n" +
      "  3. If it still fails, confirm your Entra app has the delegated permission 'Power Platform API > CopilotStudio.Copilots.Invoke' with admin consent granted.";
  } else if (
    lower.includes("aadsts65001") ||
    lower.includes("consent_required") ||
    lower.includes("interaction_required")
  ) {
    code = "consent_required";
    hint =
      "Your Entra app registration is missing admin consent for 'Power Platform API > CopilotStudio.Copilots.Invoke'. Ask a tenant admin to grant consent, then re-run 'Agent Workbench: Reset Direct Line Sign-in' before retrying.";
  } else if (lower.includes("aadsts70011") || lower.includes("invalid_scope")) {
    code = "invalid_scope";
    hint =
      "Entra rejected the requested scope. Verify the app registration has the delegated 'Power Platform API > CopilotStudio.Copilots.Invoke' permission added (not just application permission).";
  } else if (
    lower.includes("aadsts50020") ||
    lower.includes("aadsts50057") ||
    lower.includes("user_not_in_tenant")
  ) {
    code = "wrong_account";
    hint =
      "The account you signed in with isn't in the tenant configured for this workspace. Run 'Agent Workbench: Reset Direct Line Sign-in', then sign in again with an account that belongs to the configured tenant.";
  } else if (
    lower.includes("network") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset")
  ) {
    code = "network_error";
    hint =
      "MSAL couldn't reach login.microsoftonline.com. Check your network / proxy and try again.";
  }

  const wrapped = new Error(
    `Direct Line sign-in failed (${code}).\n\n${hint}\n\nRaw MSAL error: ${raw || "(no detail)"}`,
  ) as DirectLineSignInError;
  wrapped[DIRECT_LINE_SIGNIN_ERROR] = true;
  wrapped.code = code;
  wrapped.hint = hint;
  wrapped.raw = raw;
  // Preserve original stack for diagnostics.
  if (err instanceof Error && err.stack) {
    wrapped.stack = err.stack;
  }
  return wrapped;
}
