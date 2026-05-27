// Azure Resource Manager discovery: subscriptions, Azure OpenAI accounts, deployments.
import type { TokenProvider } from "@agent-workbench/core";
import { getJson } from "./http.js";

export interface AzureSubscription {
  subscriptionId: string;
  displayName: string;
}

export interface AzureOpenAIAccount {
  id: string;
  name: string;
  resourceGroup: string;
  endpoint?: string;
  location: string;
  sku?: string;
  kind: string;
}

export interface AzureOpenAIDeployment {
  name: string;
  modelName: string;
  modelVersion: string;
  supportsStructuredOutput: boolean;
}

const STRUCTURED_OUTPUT_MODELS = [/^gpt-4o/i, /^gpt-4\.1/i, /^o3/i, /^o4/i];

function supportsStructuredOutput(modelName: string): boolean {
  return STRUCTURED_OUTPUT_MODELS.some((re) => re.test(modelName));
}

function extractResourceGroup(resourceId: string): string {
  const match = resourceId.match(/\/resourceGroups\/([^/]+)/i);
  return match ? match[1] : "";
}

export const armDiscovery = {
  async listSubscriptions(
    tokenProvider: TokenProvider,
  ): Promise<AzureSubscription[]> {
    const data = await getJson<{ value?: Array<Record<string, unknown>> }>(
      "https://management.azure.com/subscriptions?api-version=2022-12-01",
      tokenProvider,
      { step: "subscription", message: "Could not list Azure subscriptions." },
    );
    return (data.value ?? []).map((sub) => ({
      subscriptionId: String(sub.subscriptionId ?? ""),
      displayName: String(
        sub.displayName ?? sub.subscriptionId ?? "Subscription",
      ),
    }));
  },

  async listOpenAIAccounts(
    tokenProvider: TokenProvider,
    subscriptionId: string,
  ): Promise<AzureOpenAIAccount[]> {
    const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CognitiveServices/accounts?api-version=2024-10-01`;
    const data = await getJson<{ value?: Array<Record<string, unknown>> }>(
      url,
      tokenProvider,
      {
        step: "openAIAccount",
        message: "Could not list Cognitive Services accounts.",
      },
    );
    return (data.value ?? [])
      .filter((acc) => {
        const kind = String(acc.kind ?? "");
        return kind === "OpenAI" || kind === "AIServices";
      })
      .map((acc) => {
        const props =
          (acc.properties as Record<string, unknown> | undefined) ?? {};
        const sku = (acc.sku as Record<string, unknown> | undefined) ?? {};
        const id = String(acc.id ?? "");
        return {
          id,
          name: String(acc.name ?? ""),
          resourceGroup: extractResourceGroup(id),
          endpoint:
            typeof props.endpoint === "string" ? props.endpoint : undefined,
          location: String(acc.location ?? ""),
          sku: typeof sku.name === "string" ? sku.name : undefined,
          kind: String(acc.kind ?? ""),
        };
      });
  },

  async listDeployments(
    tokenProvider: TokenProvider,
    account: AzureOpenAIAccount,
  ): Promise<AzureOpenAIDeployment[]> {
    const url = `https://management.azure.com${account.id}/deployments?api-version=2024-10-01`;
    const data = await getJson<{ value?: Array<Record<string, unknown>> }>(
      url,
      tokenProvider,
      {
        step: "deployment",
        message: "Could not list Azure OpenAI deployments.",
      },
    );
    return (data.value ?? []).map((dep) => {
      const props =
        (dep.properties as Record<string, unknown> | undefined) ?? {};
      const model = (props.model as Record<string, unknown> | undefined) ?? {};
      const modelName = String(model.name ?? "");
      return {
        name: String(dep.name ?? ""),
        modelName,
        modelVersion: String(model.version ?? ""),
        supportsStructuredOutput: supportsStructuredOutput(modelName),
      };
    });
  },
};
