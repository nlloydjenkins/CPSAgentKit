// Code lens above CPS agent root YAML offering "Run agent tests" / "Configure tests".
import * as vscode from "vscode";

const PATTERN = /(^|[\\/])(bot|agents?)[\\/].+\.bot\.ya?ml$/i;

export class AgentTestsCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (
      !PATTERN.test(document.uri.fsPath) &&
      !/settings\.(mcs\.)?ya?ml$/i.test(document.uri.fsPath)
    ) {
      return [];
    }
    const top = new vscode.Range(0, 0, 0, 0);
    const agentFolder = inferAgentFolder(document.uri.fsPath);
    return [
      new vscode.CodeLens(top, {
        title: "▶ Run agent tests",
        command: "agentWorkbench.runAgentTests",
        arguments: [agentFolder],
      }),
      new vscode.CodeLens(top, {
        title: "⚙ Configure tests",
        command: "agentWorkbench.configureAgentTests",
        arguments: [agentFolder],
      }),
    ];
  }
}

function inferAgentFolder(filePath: string): string | undefined {
  const parts = filePath.split(/[\\/]/);
  // settings.yaml lives directly under the agent folder.
  const idx = parts.findIndex((p) => /^settings(\.mcs)?\.ya?ml$/i.test(p));
  if (idx > 0) {
    return parts[idx - 1];
  }
  // bot/<agent>/<agent>.bot.yml
  const botIdx = parts.findIndex((p) => p === "bot");
  if (botIdx >= 0 && parts[botIdx + 1]) {
    return parts[botIdx + 1];
  }
  return undefined;
}
