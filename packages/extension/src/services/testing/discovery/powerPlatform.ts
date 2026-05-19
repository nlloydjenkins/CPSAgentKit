// Business Application Platform API discovery for Power Platform environments.
import type { TokenProvider } from "@cpsagentkit/core";
import { getJson } from "./http.js";

export interface PowerPlatformEnvironment {
  name: string;
  displayName: string;
  instanceUrl?: string;
  /**
   * Power Platform API hostname for Copilot Studio Direct Line.
   * Derived from the environment id, not the Dataverse hostname.
   */
  hostname?: string;
  /** Dataverse hostname for reference only. */
  dataverseHostname?: string;
  region?: string;
  sku?: string;
}

const BAP_LIST_URL =
  "https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=2020-10-01&$expand=properties";

/**
 * Build the Power Platform API hostname expected by the Copilot Studio
 * Direct Line endpoint, e.g.
 *   `{first30Hex}.{last2Hex}.environment.api.powerplatform.com`
 * This mirrors the algorithm used by the Microsoft.Agents.CopilotStudio.Client
 * SDK.
 */
export function buildPowerPlatformApiHostname(
  environmentId: string,
): string | undefined {
  const hex = environmentId.replace(/-/g, "").toLowerCase();
  if (hex.length !== 32 || !/^[0-9a-f]{32}$/.test(hex)) {
    return undefined;
  }
  const prefix = hex.slice(0, hex.length - 2);
  const suffix = hex.slice(hex.length - 2);
  return `${prefix}.${suffix}.environment.api.powerplatform.com`;
}

export const powerPlatformDiscovery = {
  async listEnvironments(
    tokenProvider: TokenProvider,
  ): Promise<PowerPlatformEnvironment[]> {
    const data = await getJson<{ value?: Array<Record<string, unknown>> }>(
      BAP_LIST_URL,
      tokenProvider,
      {
        step: "environment",
        message:
          "Could not list Power Platform environments. Make sure your account has access to the BAP API.",
      },
    );
    return (data.value ?? []).map((env) => {
      const props =
        (env.properties as Record<string, unknown> | undefined) ?? {};
      const linked =
        (props.linkedEnvironmentMetadata as
          | Record<string, unknown>
          | undefined) ?? {};
      const instanceUrl =
        typeof linked.instanceUrl === "string" ? linked.instanceUrl : undefined;
      let dataverseHostname: string | undefined;
      if (instanceUrl) {
        try {
          dataverseHostname = new URL(instanceUrl).host;
        } catch {
          // ignore
        }
      }
      const envId = String(env.name ?? "");
      const ppHostname = buildPowerPlatformApiHostname(envId);
      return {
        name: envId,
        displayName: String(props.displayName ?? env.name ?? "Environment"),
        instanceUrl,
        hostname: ppHostname,
        dataverseHostname,
        region:
          typeof props.azureRegion === "string" ? props.azureRegion : undefined,
        sku:
          typeof props.environmentSku === "string"
            ? props.environmentSku
            : undefined,
      };
    });
  },
};
