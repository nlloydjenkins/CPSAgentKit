import * as vscode from "vscode";
import {
  readTestConfig,
  type TestConfig,
} from "../services/testing/testConfig.js";
import { msalCacheKey } from "../services/testing/msalDirectLine.js";

export async function resetDirectLineSigninCommand(
  context: vscode.ExtensionContext,
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    void vscode.window.showErrorMessage(
      "Agent Workbench: open a workspace folder first.",
    );
    return;
  }

  let config: Partial<TestConfig> | undefined;
  try {
    config = await readTestConfig(workspaceFolder.uri.fsPath);
  } catch {
    /* fall through */
  }

  if (config?.directLine?.tenantId && config.directLine.clientId) {
    const key = msalCacheKey(
      config.directLine.tenantId,
      config.directLine.clientId,
    );
    await context.secrets.delete(key);
    void vscode.window.showInformationMessage(
      `Agent Workbench: cleared Direct Line sign-in cache. Next run will prompt for sign-in.`,
    );
    return;
  }

  void vscode.window.showWarningMessage(
    "Agent Workbench: no Direct Line config found. Nothing to clear.",
  );
}
