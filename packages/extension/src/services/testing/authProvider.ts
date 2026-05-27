// Token acquisition using VS Code's built-in Microsoft authentication provider.
// Exposes scoped TokenProvider factories so neither core nor wizard code touches vscode.authentication directly.
import * as vscode from "vscode";
import type { TokenProvider } from "@agent-workbench/core";
import {
  createMsalDirectLineTokenProvider,
  type MsalDirectLineOptions,
} from "./msalDirectLine.js";

const MS_PROVIDER = "microsoft";

function provider(scopes: string[]): TokenProvider {
  return async () => {
    const session = await vscode.authentication.getSession(
      MS_PROVIDER,
      scopes,
      {
        createIfNone: true,
      },
    );
    if (!session) {
      throw new Error(`Sign-in cancelled for scope ${scopes.join(" ")}.`);
    }
    return session.accessToken;
  };
}

export const authProvider = {
  /**
   * Direct Line requires a token with `CopilotStudio.Copilots.Invoke` in
   * its `scp` claim. VS Code's built-in MS auth provider can't issue that,
   * so we use MSAL Node with the user's own Entra app registration.
   */
  forDirectLine(opts: MsalDirectLineOptions): TokenProvider {
    return createMsalDirectLineTokenProvider(opts);
  },
  forBap(): TokenProvider {
    return provider(["https://api.bap.microsoft.com/.default"]);
  },
  forArm(): TokenProvider {
    return provider(["https://management.azure.com/.default"]);
  },
  forAzureOpenAI(): TokenProvider {
    return provider(["https://cognitiveservices.azure.com/.default"]);
  },
  /**
   * Extract the tenant id from a token we are already entitled to mint.
   * Avoids Microsoft Graph (VS Code's first-party app is not pre-authorised
   * for Directory.Read.All / Organization.Read.All, which causes AADSTS65002).
   */
  async getTenantId(): Promise<string | undefined> {
    try {
      const token = await provider([
        "https://api.bap.microsoft.com/.default",
      ])();
      return decodeTenantIdFromJwt(token);
    } catch {
      return undefined;
    }
  },
};

function decodeTenantIdFromJwt(jwt: string): string | undefined {
  const parts = jwt.split(".");
  if (parts.length < 2) return undefined;
  try {
    const payload = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf-8");
    const obj = JSON.parse(payload) as { tid?: string };
    return typeof obj.tid === "string" ? obj.tid : undefined;
  } catch {
    return undefined;
  }
}
