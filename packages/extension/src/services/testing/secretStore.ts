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

const NAMESPACE = "cpsAgentKit";

export interface SecretStore {
  getAzureOpenAIKey(): Promise<string | undefined>;
  setAzureOpenAIKey(value: string): Promise<void>;
  clearAzureOpenAIKey(): Promise<void>;
  getServicePrincipalSecret(): Promise<string | undefined>;
  setServicePrincipalSecret(value: string): Promise<void>;
}

export function createSecretStore(
  secrets: vscode.SecretStorage,
  workspaceFolder: vscode.WorkspaceFolder,
): SecretStore {
  const key = workspaceKey(workspaceFolder);
  const aoai = `${NAMESPACE}.azureOpenAI.apiKey.${key}`;
  const sp = `${NAMESPACE}.servicePrincipal.secret.${key}`;
  return {
    async getAzureOpenAIKey() {
      return secrets.get(aoai);
    },
    async setAzureOpenAIKey(value: string) {
      await secrets.store(aoai, value);
    },
    async clearAzureOpenAIKey() {
      await secrets.delete(aoai);
    },
    async getServicePrincipalSecret() {
      return secrets.get(sp);
    },
    async setServicePrincipalSecret(value: string) {
      await secrets.store(sp, value);
    },
  };
}
