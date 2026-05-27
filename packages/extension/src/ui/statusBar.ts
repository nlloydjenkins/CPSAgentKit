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
    this.item.command = "agentWorkbench.syncKnowledge";
    this.item.tooltip = "Agent Workbench — click to sync knowledge";
    this.setChecking();
  }

  setChecking(): void {
    this.item.text = "$(sync) Agent Workbench: Checking...";
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
    this.item.text = "$(circle-slash) Agent Workbench: Not initialised";
    this.item.show();
  }

  setInitialised(): void {
    this.item.text = "$(check) Agent Workbench: Initialised";
    this.item.show();
  }

  setSyncing(): void {
    this.item.text = "$(sync~spin) Agent Workbench: Syncing...";
    this.item.show();
  }

  setSynced(): void {
    this.item.text = "$(check) Agent Workbench: Synced";
    this.item.show();
  }

  setError(): void {
    this.item.text = "$(warning) Agent Workbench: Sync failed";
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
