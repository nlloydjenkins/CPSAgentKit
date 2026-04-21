import * as vscode from "vscode";
import { detectProjectState, ProjectState } from "../services/projectState.js";

/** A single item in the sidebar tree */
export class CommandTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly commandId: string | undefined,
    public readonly icon: string,
    public readonly enabled: boolean = true,
    public readonly itemDescription?: string,
    public readonly disabledReason?: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = enabled ? "enabled" : "disabled";
    this.iconPath = new vscode.ThemeIcon(icon);
    this.description = itemDescription;

    if (commandId && enabled) {
      this.command = {
        title: label,
        command: commandId,
      };
    }

    if (!enabled && commandId) {
      const reason = disabledReason ?? "initialise the project first";
      this.tooltip = `${label} — ${reason}`;
    } else if (!enabled && !commandId) {
      this.tooltip = label;
    }
  }
}

/** Section header in the tree */
class SectionHeader extends vscode.TreeItem {
  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "section";
  }
}

type TreeNode = CommandTreeItem | SectionHeader;

/** Provides the sidebar tree view for CPSAgentKit commands */
export class SidebarProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private state: ProjectState = {
    isInitialised: false,
    hasSpec: false,
    hasArchitecture: false,
    hasKnowledge: false,
    hasRequirementsDocs: false,
    hasBestPractices: false,
    hasCpsExtensionAgent: false,
    agentFolders: [],
  };

  private watcher: vscode.FileSystemWatcher | undefined;

  constructor() {
    this.refreshState();

    // Watch for workspace file changes that might affect state
    this.watcher = vscode.workspace.createFileSystemWatcher(
      "**/{.cpsagentkit,Requirements}/**",
    );
    this.watcher.onDidCreate(() => this.refreshState());
    this.watcher.onDidDelete(() => this.refreshState());
    this.watcher.onDidChange(() => this.refreshState());
  }

  /** Refresh the project state and update the tree */
  async refreshState(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      this.state = await detectProjectState(root);
    }
    vscode.commands.executeCommand(
      "setContext",
      "cpsAgentKit.isInitialised",
      this.state.isInitialised,
    );
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element instanceof SectionHeader) {
      return this.getCommandsForSection(element.label as string);
    }

    // Root level — return section headers
    return [
      new SectionHeader("Setup"),
      new SectionHeader("Plan"),
      new SectionHeader("Build"),
      new SectionHeader("Assess"),
    ];
  }

  private getCommandsForSection(section: string): CommandTreeItem[] {
    const init = this.state.isInitialised;
    const hasSpec = this.state.hasSpec;
    const hasArch = this.state.hasArchitecture;
    const hasAgent = this.state.hasCpsExtensionAgent;
    const hasDocs = this.state.hasRequirementsDocs;

    switch (section) {
      case "Setup":
        return [
          new CommandTreeItem(
            "Initialise Project",
            "cpsAgentKit.init",
            "folder-opened",
            true,
            init ? "✓ done" : undefined,
          ),
          new CommandTreeItem(
            "Sync Knowledge",
            "cpsAgentKit.syncKnowledge",
            "cloud-download",
            init,
          ),
        ];

      case "Plan":
        return [
          new CommandTreeItem(
            "Add Requirements",
            undefined,
            "file-add",
            init,
            hasDocs
              ? "✓ docs found"
              : init
                ? "add files to Requirements/docs/"
                : undefined,
          ),
          new CommandTreeItem(
            "Create Plan",
            "cpsAgentKit.createSpec",
            "notebook",
            init && hasDocs,
            hasArch ? "✓ customised" : undefined,
            !init
              ? undefined
              : !hasDocs
                ? "add requirements docs first"
                : undefined,
          ),
        ];

      case "Build":
        return [
          new CommandTreeItem(
            "Pre-Build Checklist",
            "cpsAgentKit.preBuild",
            "checklist",
            init && hasArch,
            undefined,
            !hasArch ? "create plan first" : undefined,
          ),
          new CommandTreeItem(
            "Build Agent",
            "cpsAgentKit.buildAgent",
            "rocket",
            init && hasArch,
            undefined,
            !hasArch ? "create plan first" : undefined,
          ),
        ];

      case "Assess":
        return [
          new CommandTreeItem(
            "Run Agent Assessment",
            "cpsAgentKit.reviewSolution",
            "beaker",
            init && hasAgent,
            undefined,
            !hasAgent ? "sync a CPS agent first" : undefined,
          ),
          new CommandTreeItem(
            "Run Solution Assessment",
            "cpsAgentKit.reviewSolutionFile",
            "file-symlink-file",
            init && hasAgent,
            undefined,
            !hasAgent ? "sync a CPS agent first" : undefined,
          ),
        ];

      default:
        return [];
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this.watcher?.dispose();
  }
}
