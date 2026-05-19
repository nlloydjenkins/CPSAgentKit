import * as vscode from "vscode";
import { withErrorSurface } from "../services/testing/diagnostics.js";
import { runSetupWizard } from "../services/testing/setupWizard.js";
import { requireWorkspaceRoot } from "../ui/uiUtils.js";

export async function configureAgentTestsCommand(
  context: vscode.ExtensionContext,
): Promise<void> {
  await withErrorSurface("configureAgentTests", () =>
    runWizard(context, "tenant", "test configuration saved"),
  );
}

export async function connectAzureOpenAIJudgeCommand(
  context: vscode.ExtensionContext,
): Promise<void> {
  await withErrorSurface("connectAzureOpenAIJudge", () =>
    runWizard(context, "judge", "Azure OpenAI judge connected"),
  );
}

export async function changeAgentTestEnvironmentCommand(
  context: vscode.ExtensionContext,
): Promise<void> {
  await withErrorSurface("changeAgentTestEnvironment", () =>
    runWizard(context, "environment", "environment updated"),
  );
}

async function runWizard(
  context: vscode.ExtensionContext,
  startStep: "tenant" | "environment" | "judge" | "auth",
  successLabel: string,
): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) return;
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  const result = await runSetupWizard({
    workspaceRoot: root,
    workspaceFolder: folder,
    secrets: context.secrets,
    startStep,
  });
  if (result.saved) {
    vscode.window.showInformationMessage(`CPSAgentKit: ${successLabel}.`);
  }
}
