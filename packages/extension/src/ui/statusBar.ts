import * as vscode from "vscode";
import type { ProjectState } from "../services/projectState.js";

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
    this.setChecking();
  }

  setChecking(): void {
    this.item.text = "$(sync) CPSAgentKit: Checking...";
    this.item.show();
  }

  setFromProjectState(state: ProjectState): void {
    if (!state.isInitialised) {
      this.setNotInitialised();
      return;
    }

    if (state.hasKnowledge || state.hasBestPractices) {
      this.setSynced();
      return;
    }

    this.setInitialised();
  }

  setNotInitialised(): void {
    this.item.text = "$(circle-slash) CPSAgentKit: Not initialised";
    this.item.show();
  }

  setInitialised(): void {
    this.item.text = "$(check) CPSAgentKit: Initialised";
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
