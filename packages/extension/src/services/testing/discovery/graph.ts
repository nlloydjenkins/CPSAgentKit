// Microsoft Graph discovery for tenant and owned app registrations.
import type { TokenProvider } from "@cpsagentkit/core";
import { getJson, pagedValues } from "./http.js";

export interface TenantInfo {
  tenantId: string;
  displayName: string;
  defaultDomain?: string;
}

export interface OwnedAppRegistration {
  appId: string;
  displayName: string;
}

export const graphDiscovery = {
  async listTenants(tokenProvider: TokenProvider): Promise<TenantInfo[]> {
    const data = await getJson<{ value?: Array<Record<string, unknown>> }>(
      "https://graph.microsoft.com/v1.0/organization",
      tokenProvider,
      {
        step: "tenant",
        message: "Could not list tenants from Microsoft Graph.",
      },
    );
    return (data.value ?? []).map((org) => {
      const domains =
        (org.verifiedDomains as Array<Record<string, unknown>> | undefined) ??
        [];
      const def = domains.find((d) => d.isDefault === true);
      return {
        tenantId: String(org.id ?? ""),
        displayName: String(org.displayName ?? "Tenant"),
        defaultDomain: def ? String(def.name ?? "") : undefined,
      };
    });
  },

  async listOwnedApps(
    tokenProvider: TokenProvider,
  ): Promise<OwnedAppRegistration[]> {
    const items = await pagedValues<Record<string, unknown>>(
      "https://graph.microsoft.com/v1.0/me/ownedObjects/microsoft.graph.application?$select=appId,displayName",
      tokenProvider,
      { step: "auth", message: "Could not list owned app registrations." },
    );
    return items
      .filter((it) => typeof it.appId === "string")
      .map((it) => ({
        appId: String(it.appId),
        displayName: String(it.displayName ?? it.appId),
      }));
  },
};
