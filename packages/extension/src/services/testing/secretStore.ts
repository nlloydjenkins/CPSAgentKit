// Stable, workspace-scoped secret key helpers.
import * as crypto from "crypto";
import * as vscode from "vscode";

export function workspaceKey(workspaceFolder: vscode.WorkspaceFolder): string {
  return crypto
    .createHash("sha256")
    .update(workspaceFolder.uri.fsPath)
    .digest("hex")
    .slice(0, 16);
}

const NAMESPACE = "agentWorkbench";
const LEGACY_NAMESPACE = "cpsAgentKit";

export interface SecretStore {
  getAzureOpenAIKey(): Promise<string | undefined>;
  setAzureOpenAIKey(value: string): Promise<void>;
  clearAzureOpenAIKey(): Promise<void>;
  getServicePrincipalSecret(): Promise<string | undefined>;
  setServicePrincipalSecret(value: string): Promise<void>;
}

/** Read a secret, falling back to the legacy `cpsAgentKit.*` namespace if the new key is missing. */
async function getWithFallback(
  secrets: vscode.SecretStorage,
  newKey: string,
  legacyKey: string,
): Promise<string | undefined> {
  const value = await secrets.get(newKey);
  if (value !== undefined) {
    return value;
  }
  const legacy = await secrets.get(legacyKey);
  if (legacy !== undefined) {
    // Promote the secret to the new namespace so subsequent reads are direct.
    await secrets.store(newKey, legacy);
    await secrets.delete(legacyKey);
    return legacy;
  }
  return undefined;
}

export function createSecretStore(
  secrets: vscode.SecretStorage,
  workspaceFolder: vscode.WorkspaceFolder,
): SecretStore {
  const key = workspaceKey(workspaceFolder);
  const aoai = `${NAMESPACE}.azureOpenAI.apiKey.${key}`;
  const sp = `${NAMESPACE}.servicePrincipal.secret.${key}`;
  const legacyAoai = `${LEGACY_NAMESPACE}.azureOpenAI.apiKey.${key}`;
  const legacySp = `${LEGACY_NAMESPACE}.servicePrincipal.secret.${key}`;
  return {
    async getAzureOpenAIKey() {
      return getWithFallback(secrets, aoai, legacyAoai);
    },
    async setAzureOpenAIKey(value: string) {
      await secrets.store(aoai, value);
    },
    async clearAzureOpenAIKey() {
      await secrets.delete(aoai);
      await secrets.delete(legacyAoai);
    },
    async getServicePrincipalSecret() {
      return getWithFallback(secrets, sp, legacySp);
    },
    async setServicePrincipalSecret(value: string) {
      await secrets.store(sp, value);
    },
  };
}
