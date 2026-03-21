import * as vscode from "vscode";

/** Status bar item showing CPS sync state */
export class StatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50,
    );
    this.item.command = "cpsAgentKit.syncKnowledge";
    this.item.tooltip = "CPSAgentKit — click to sync knowledge";
    this.setNotInitialised();
  }

  setNotInitialised(): void {
    this.item.text = "$(circle-slash) CPSAgentKit: Not initialised";
    this.item.show();
  }

  setSyncing(): void {
    this.item.text = "$(sync~spin) CPSAgentKit: Syncing...";
    this.item.show();
  }

  setSynced(): void {
    this.item.text = "$(check) CPSAgentKit: Synced";
    this.item.show();
  }

  setError(): void {
    this.item.text = "$(warning) CPSAgentKit: Sync failed";
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
