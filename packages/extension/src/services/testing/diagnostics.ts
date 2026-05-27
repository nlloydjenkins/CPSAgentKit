// Shared output channel + helpers for surfacing wizard/run errors visibly.
import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getTestingChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Agent Workbench Tests");
  }
  return channel;
}

export function logInfo(message: string): void {
  getTestingChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function logError(message: string, err: unknown): void {
  const ch = getTestingChannel();
  ch.appendLine(`[${new Date().toISOString()}] ERROR: ${message}`);
  if (err instanceof Error) {
    ch.appendLine(`  ${err.name}: ${err.message}`);
    if (err.stack) ch.appendLine(err.stack);
  } else {
    ch.appendLine(`  ${String(err)}`);
  }
}

export async function withErrorSurface<T>(
  label: string,
  body: () => Promise<T>,
): Promise<T | undefined> {
  try {
    logInfo(`${label}: start`);
    const result = await body();
    logInfo(`${label}: complete`);
    return result;
  } catch (err) {
    logError(label, err);
    const msg = err instanceof Error ? err.message : String(err);
    const choice = await vscode.window.showErrorMessage(
      `Agent Workbench ${label}: ${msg}`,
      "Show details",
    );
    if (choice === "Show details") {
      getTestingChannel().show(true);
    }
    return undefined;
  }
}
