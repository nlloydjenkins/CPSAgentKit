import * as path from "path";

/**
 * Returns the extension root directory.
 *
 * At runtime, __dirname resolves to `out/services/` (or `out/commands/`).
 * Walking up two levels reaches the extension root where `templates/`,
 * `docs/`, and other repo-level directories live.
 */
export function getExtensionRoot(): string {
  return path.dirname(path.dirname(__dirname));
}
