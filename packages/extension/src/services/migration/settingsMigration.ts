// One-time migration of legacy `cpsAgentKit.*` VS Code settings to the new
// `agentWorkbench.*` namespace. Idempotent — guarded by a globalState flag.
import * as vscode from "vscode";

const MIGRATION_FLAG = "agentWorkbench.migratedSettings";
const LEGACY_SECTION = "cpsAgentKit";
const NEW_SECTION = "agentWorkbench";
const KEYS: ReadonlyArray<string> = [
  "knowledgeRepoUrl",
  "knowledgeRepoBranch",
  "syncOnOpen",
];

/**
 * Copy any user-set values from the legacy `cpsAgentKit.*` settings section to
 * the new `agentWorkbench.*` section. Skips keys that already have a value in
 * the new section. Runs at most once per machine; subsequent calls are no-ops.
 */
export async function migrateLegacySettings(
  context: vscode.ExtensionContext,
): Promise<void> {
  if (context.globalState.get<boolean>(MIGRATION_FLAG) === true) {
    return;
  }

  const legacy = vscode.workspace.getConfiguration(LEGACY_SECTION);
  const next = vscode.workspace.getConfiguration(NEW_SECTION);

  for (const key of KEYS) {
    const legacyInspect = legacy.inspect(key);
    const newInspect = next.inspect(key);
    if (!legacyInspect) {
      continue;
    }

    // Migrate per-scope so user/workspace/folder settings stay where the user
    // put them.
    if (
      legacyInspect.globalValue !== undefined &&
      newInspect?.globalValue === undefined
    ) {
      await next.update(
        key,
        legacyInspect.globalValue,
        vscode.ConfigurationTarget.Global,
      );
    }
    if (
      legacyInspect.workspaceValue !== undefined &&
      newInspect?.workspaceValue === undefined
    ) {
      await next.update(
        key,
        legacyInspect.workspaceValue,
        vscode.ConfigurationTarget.Workspace,
      );
    }
    if (
      legacyInspect.workspaceFolderValue !== undefined &&
      newInspect?.workspaceFolderValue === undefined
    ) {
      await next.update(
        key,
        legacyInspect.workspaceFolderValue,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
    }
  }

  await context.globalState.update(MIGRATION_FLAG, true);
}
