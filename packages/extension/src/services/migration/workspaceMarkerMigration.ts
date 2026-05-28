// One-time migration of the legacy workspace project-state directory
// (`.cpsagentkit/`) to the new `.agent-workbench/`. Runs at activation time.
//
// Safe semantics:
// - If `.agent-workbench/` already exists, do nothing.
// - If only `.cpsagentkit/` exists, rename it to `.agent-workbench/`.
// - If neither exists, do nothing (init will create the new dir later).
// - Per-workspace, idempotent.
import * as fs from "fs/promises";
import * as path from "path";

const LEGACY_DIR = ".cpsagentkit";
const NEW_DIR = ".agent-workbench";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Migrate a single workspace folder from `.cpsagentkit/` to `.agent-workbench/`.
 * Returns `true` when a rename happened.
 */
export async function migrateWorkspaceMarker(
  workspaceRoot: string,
): Promise<boolean> {
  const legacy = path.join(workspaceRoot, LEGACY_DIR);
  const next = path.join(workspaceRoot, NEW_DIR);

  if (await exists(next)) {
    return false;
  }
  if (!(await exists(legacy))) {
    return false;
  }

  try {
    await fs.rename(legacy, next);
    return true;
  } catch {
    // Cross-device or permission failure — leave the legacy dir intact and
    // let the resolver fall back to it.
    return false;
  }
}
