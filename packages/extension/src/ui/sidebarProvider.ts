import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { detectProjectState, ProjectState } from "../services/projectState.js";

interface BuildChecklistItem {
  label: string;
  done: boolean;
  section?: string;
}

interface BuildChecklistState {
  exists: boolean;
  items: BuildChecklistItem[];
}

/** A single item in the sidebar tree */
export class CommandTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly commandId: string | undefined,
    public readonly icon: string,
    public readonly enabled: boolean = true,
    public readonly itemDescription?: string,
    public readonly disabledReason?: string,
    public readonly childKind?: "buildChecklist",
  ) {
    super(
      label,
      childKind
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
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

class BuildChecklistTreeItem extends vscode.TreeItem {
  constructor(item: BuildChecklistItem) {
    super(item.label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "buildChecklistItem";
    this.iconPath = new vscode.ThemeIcon(
      item.done ? "check" : "circle-outline",
    );
    this.description = item.done ? "done" : "open";
    this.tooltip = item.section ? `${item.section}: ${item.label}` : item.label;
  }
}

/** Section header in the tree */
class SectionHeader extends vscode.TreeItem {
  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "section";
  }
}

type TreeNode = CommandTreeItem | SectionHeader | BuildChecklistTreeItem;

async function parseBuildChecklist(
  workspaceRoot: string,
): Promise<BuildChecklistState> {
  const checklistPath = path.join(
    workspaceRoot,
    "Requirements",
    "build-checklist.md",
  );

  let content: string;
  try {
    content = await fs.readFile(checklistPath, "utf-8");
  } catch {
    return { exists: false, items: [] };
  }

  const items: BuildChecklistItem[] = [];
  let section: string | undefined;

  for (const rawLine of content.split(/\r?\n/)) {
    const heading = rawLine.match(/^##\s+(.+)\s*$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }

    const item = rawLine.match(/^\s*-\s+\[([ xX])\]\s+(.+)\s*$/);
    if (item) {
      items.push({
        done: item[1].toLowerCase() === "x",
        label: item[2].trim(),
        section,
      });
    }
  }

  return { exists: true, items };
}

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

  private buildChecklist: BuildChecklistState = { exists: false, items: [] };

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
      const [state, buildChecklist] = await Promise.all([
        detectProjectState(root),
        parseBuildChecklist(root),
      ]);
      this.state = state;
      this.buildChecklist = buildChecklist;
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

    if (element instanceof CommandTreeItem) {
      if (element.childKind === "buildChecklist") {
        return this.buildChecklist.items.map(
          (item) => new BuildChecklistTreeItem(item),
        );
      }
      return [];
    }

    // Root level — keep the user-facing path compact and sequential.
    return [new SectionHeader("Workflow"), new SectionHeader("Utilities")];
  }

  private getCommandsForSection(section: string): CommandTreeItem[] {
    const init = this.state.isInitialised;
    const hasArch = this.state.hasArchitecture;
    const hasAgent = this.state.hasCpsExtensionAgent;
    const hasDocs = this.state.hasRequirementsDocs;

    switch (section) {
      case "Workflow":
        return [
          new CommandTreeItem(
            "1. Initialise Project",
            "cpsAgentKit.init",
            "folder-opened",
            true,
            init ? "✓ done" : undefined,
          ),
          new CommandTreeItem(
            "2. Create Plan",
            "cpsAgentKit.createSpec",
            "notebook",
            init && (hasDocs || hasAgent),
            hasArch
              ? "✓ plan ready"
              : hasDocs
                ? "docs found"
                : hasAgent
                  ? "synced agent found"
                  : undefined,
            !init
              ? undefined
              : !(hasDocs || hasAgent)
                ? "add requirements docs or sync a CPS agent first"
                : undefined,
          ),
          new CommandTreeItem(
            "Pre-Build Agent",
            "cpsAgentKit.preBuildAgent",
            "wand",
            init && hasDocs,
            hasArch ? "review plan" : undefined,
            !init
              ? undefined
              : !hasDocs
                ? "add requirements docs first"
                : undefined,
          ),
          new CommandTreeItem(
            "Prepare for Build",
            "cpsAgentKit.prepareForBuild",
            "checklist",
            init && hasArch,
            undefined,
            !hasArch ? "create plan first" : undefined,
          ),
          new CommandTreeItem(
            "3. Build Agent",
            "cpsAgentKit.buildAgent",
            "rocket",
            init && hasArch,
            this.buildChecklist.exists ? "checklist open" : undefined,
            !hasArch ? "create plan first" : undefined,
          ),
          new CommandTreeItem(
            "4. Assess Agent",
            "cpsAgentKit.reviewSolution",
            "beaker",
            init && hasAgent,
            undefined,
            !hasAgent ? "sync a CPS agent first" : undefined,
          ),
        ];

      case "Utilities":
        return [
          new CommandTreeItem(
            "Sync Knowledge",
            "cpsAgentKit.syncKnowledge",
            "cloud-download",
            init,
          ),
          new CommandTreeItem(
            "Open Build Checklist",
            "cpsAgentKit.buildChecklist",
            "checklist",
            init && (hasArch || this.buildChecklist.exists),
            this.buildChecklist.exists ? "✓ available" : undefined,
            !hasArch ? "create plan first" : undefined,
            this.buildChecklist.items.length > 0 ? "buildChecklist" : undefined,
          ),
          new CommandTreeItem(
            "Run Solution Assessment",
            "cpsAgentKit.reviewSolutionFile",
            "file-symlink-file",
            init && hasAgent,
            undefined,
            !hasAgent ? "sync a CPS agent first" : undefined,
          ),
          new CommandTreeItem(
            "Configure Agent Tests…",
            "cpsAgentKit.configureAgentTests",
            "gear",
            init && hasAgent,
            undefined,
            !hasAgent ? "sync a CPS agent first" : undefined,
          ),
          new CommandTreeItem(
            "Run Agent Tests",
            "cpsAgentKit.runAgentTests",
            "play",
            init && hasAgent,
            undefined,
            !hasAgent ? "sync a CPS agent first" : undefined,
          ),
          new CommandTreeItem(
            "Connect Azure OpenAI Judge…",
            "cpsAgentKit.connectAzureOpenAIJudge",
            "key",
            init && hasAgent,
            undefined,
            !hasAgent ? "sync a CPS agent first" : undefined,
          ),
          new CommandTreeItem(
            "Build Demo",
            "cpsAgentKit.buildDemo",
            "play-circle",
            init,
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
