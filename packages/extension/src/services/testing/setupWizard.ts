// Multi-step setup wizard. Discovery-driven; the maker picks every value.
// See LLD §6.4.
import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import {
  findCpsAgentFolders,
  generateStarterSuite,
  readAgentSnapshot,
} from "@agent-workbench-for-copilot-studio/core";
import type {
  AuthMode,
  AzureOpenAIAuthMode,
  AzureOpenAIJudgeConfig,
  DirectLineConfig,
  JudgeConfig,
  RetryConfig,
  TestConfig,
} from "./testConfig.js";
import {
  DEFAULT_RETRY,
  ensureGitignore,
  readTestConfig,
  writeTestConfig,
} from "./testConfig.js";
import { authProvider } from "./authProvider.js";
import { logError, logInfo } from "./diagnostics.js";
import { powerPlatformDiscovery } from "./discovery/powerPlatform.js";
import { armDiscovery } from "./discovery/azureResourceManager.js";
import { createSecretStore } from "./secretStore.js";

const DEFAULT_PP_CLIENT_ID = "71ed2707-9ff6-42f3-a917-c531157bf86a"; // Agent Workbench Test Harness app registration (CopilotStudio.Copilots.Invoke)
const SUPPORTED_AOAI_API_VERSIONS = [
  "2024-12-01-preview",
  "2024-10-21",
  "2024-08-01-preview",
  "2024-06-01",
];
const DEFAULT_AOAI_API_VERSION = SUPPORTED_AOAI_API_VERSIONS[0];

export type WizardStartStep = "tenant" | "environment" | "judge" | "auth";

export interface WizardOptions {
  workspaceRoot: string;
  workspaceFolder: vscode.WorkspaceFolder;
  secrets: vscode.SecretStorage;
  startStep?: WizardStartStep;
  preselectAgentFolder?: string;
}

export interface WizardResult {
  saved: boolean;
  config?: TestConfig;
  agentTarget?: {
    displayName: string;
    agentFolder: string;
    botSchemaName: string;
  };
}

export async function runSetupWizard(
  opts: WizardOptions,
): Promise<WizardResult> {
  const existing = (await readTestConfig(opts.workspaceRoot)) ?? {};
  const draft: Partial<TestConfig> = JSON.parse(JSON.stringify(existing));
  draft.retry = draft.retry ?? DEFAULT_RETRY;
  draft.judge = draft.judge ?? { provider: "none" };

  let agentTarget = await pickAgent(
    opts.workspaceRoot,
    opts.preselectAgentFolder,
  );
  if (!agentTarget) {
    return { saved: false };
  }

  const start = opts.startStep ?? "tenant";

  if (start === "tenant" || start === "environment") {
    const directLine = await runDirectLineSteps(
      draft.directLine,
      start === "environment",
    );
    if (!directLine) {
      return { saved: false };
    }
    draft.directLine = directLine;
  }

  if (start === "tenant" || start === "auth") {
    const auth = await runAuthStep(draft.directLine);
    if (!auth) {
      return { saved: false };
    }
    draft.directLine = { ...(draft.directLine as DirectLineConfig), ...auth };
  }

  if (start === "tenant" || start === "judge") {
    const judge = await runJudgeStep(draft.judge, opts);
    if (!judge) {
      return { saved: false };
    }
    draft.judge = judge;
  }

  if (start === "tenant") {
    agentTarget = await pickAgent(opts.workspaceRoot, agentTarget.agentFolder);
    if (!agentTarget) {
      return { saved: false };
    }
  }

  const summary = renderSummary(draft, agentTarget);
  const confirm = await vscode.window.showInformationMessage(
    "Save Agent Workbench test configuration?",
    { modal: true, detail: summary },
    "Save",
  );
  if (confirm !== "Save") {
    vscode.window.showWarningMessage(
      'Agent Workbench: configuration not saved. Run "Configure Agent Tests…" again to retry.',
    );
    return { saved: false };
  }

  const finalConfig: TestConfig = {
    schemaVersion: "1.0",
    directLine: draft.directLine as DirectLineConfig,
    retry: draft.retry as RetryConfig,
    judge: draft.judge as JudgeConfig,
  };
  const configPath = path.join(
    opts.workspaceRoot,
    ".agent-workbench",
    "test-config.json",
  );
  try {
    await writeTestConfig(opts.workspaceRoot, finalConfig);
    logInfo(`Wrote test config to ${configPath}`);
  } catch (err) {
    logError("writeTestConfig", err);
    vscode.window.showErrorMessage(
      `Agent Workbench: failed to save test-config.json — ${(err as Error).message}`,
    );
    return { saved: false };
  }
  // Best-effort follow-ups; never block the saved config.
  try {
    await ensureGitignore(opts.workspaceRoot);
  } catch (err) {
    logError("ensureGitignore", err);
  }
  try {
    await ensureSuiteAgentBlock(opts.workspaceRoot, agentTarget);
  } catch (err) {
    logError("ensureSuiteAgentBlock", err);
  }
  try {
    await ensureStarterSuiteExists(opts.workspaceRoot, agentTarget);
  } catch (err) {
    logError("ensureStarterSuiteExists", err);
  }

  vscode.window.showInformationMessage(
    `Agent Workbench: test configuration saved at .agent-workbench/test-config.json for ${agentTarget.displayName}.`,
  );

  return { saved: true, config: finalConfig, agentTarget };
}

// ─── Steps ────────────────────────────────────────────────────────────────

export async function pickAgent(
  workspaceRoot: string,
  preselected?: string,
): Promise<
  | { displayName: string; agentFolder: string; botSchemaName: string }
  | undefined
> {
  const folders = await findCpsAgentFolders(workspaceRoot);
  if (folders.length === 0) {
    vscode.window.showErrorMessage(
      "Agent Workbench: no CPS agent folders found. Each agent folder must contain settings.yaml/settings.mcs.yml and topics/.",
    );
    return undefined;
  }

  const snapshots = await Promise.all(
    folders.map((f) => readAgentSnapshot(workspaceRoot, f)),
  );
  const items = snapshots.map((snap) => {
    const displayName = extractDisplayName(snap.settings) ?? snap.name;
    const botSchemaName = extractSchemaName(snap.settings) ?? snap.name;
    return {
      label: displayName,
      description: botSchemaName,
      detail: snap.name,
      payload: { displayName, agentFolder: snap.name, botSchemaName },
    };
  });

  if (items.length === 1) {
    return items[0].payload;
  }

  const placeholder = preselected
    ? `Confirm the agent under test (current: ${preselected})`
    : "Pick the agent under test";
  const pick = await vscode.window.showQuickPick(items, {
    title: "Agent Workbench: agent under test",
    placeHolder: placeholder,
    ignoreFocusOut: true,
  });
  return pick?.payload;
}

function extractDisplayName(settings: string): string | undefined {
  const m = settings.match(/displayName:\s*(.+)/);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

function extractSchemaName(settings: string): string | undefined {
  const m = settings.match(/schemaName:\s*(.+)/);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

async function runDirectLineSteps(
  current: DirectLineConfig | undefined,
  startAtEnvironment: boolean,
): Promise<DirectLineConfig | undefined> {
  let tenantId = current?.tenantId ?? "";
  if (!startAtEnvironment) {
    // VS Code's built-in Microsoft auth provider is not pre-authorised for
    // Microsoft Graph admin scopes (AADSTS65002), so we derive the tenant id
    // from a BAP token we already need to mint anyway.
    const detected = await safeDiscover(() => authProvider.getTenantId());
    if (detected === undefined) return undefined;
    const entered = await vscode.window.showInputBox({
      title: "Agent Workbench: confirm tenant id",
      prompt:
        "Tenant id (GUID) for the Power Platform environment you want to test against.",
      value: detected ?? current?.tenantId ?? "",
      ignoreFocusOut: true,
      validateInput: (v) =>
        /^[0-9a-fA-F-]{36}$/.test(v.trim()) ? null : "Must be a tenant GUID.",
    });
    if (!entered) return undefined;
    tenantId = entered.trim();
  }

  const envs = await safeDiscover(() =>
    powerPlatformDiscovery.listEnvironments(authProvider.forBap()),
  );
  if (!envs) return undefined;
  if (envs.length === 0) {
    vscode.window.showErrorMessage(
      "Agent Workbench: no Power Platform environments returned. Confirm you have access to the BAP API.",
    );
    return undefined;
  }

  const envItems = envs
    .filter((e) => Boolean(e.hostname))
    .map((e) => ({
      label: e.displayName,
      description: e.hostname ?? "",
      detail: `${e.sku ?? ""}${e.region ? " · " + e.region : ""}`,
      payload: e,
    }));
  envItems.push({
    label: "$(edit) Enter hostname manually…",
    description: "",
    detail: "Use when BAP discovery is unavailable",
    payload: null as unknown as (typeof envItems)[number]["payload"],
  });

  const envPick = await vscode.window.showQuickPick(envItems, {
    title: "Agent Workbench: pick Power Platform environment",
    ignoreFocusOut: true,
  });
  if (!envPick) return undefined;

  let hostname: string | undefined;
  if (envPick.payload) {
    hostname = envPick.payload.hostname;
    if (!hostname) {
      vscode.window.showErrorMessage(
        `Agent Workbench: could not derive Power Platform API hostname for environment ${envPick.payload.displayName}. Pick "Enter hostname manually" instead.`,
      );
      return undefined;
    }
  } else {
    const entered = await vscode.window.showInputBox({
      title: "Agent Workbench: Power Platform API hostname",
      prompt:
        "Enter the Power Platform API hostname for the environment, e.g. " +
        "abc1234567890123456789abcdef0.12.environment.api.powerplatform.com. " +
        "Do NOT use the Dataverse host (org.crm.dynamics.com).",
      ignoreFocusOut: true,
      validateInput: (v) =>
        v && /\.environment\.api\.powerplatform\.com$/i.test(v.trim())
          ? null
          : "Hostname must end with .environment.api.powerplatform.com",
    });
    if (!entered) return undefined;
    hostname = entered.trim();
  }

  return {
    environmentHostname: hostname!,
    tenantId,
    clientId: current?.clientId ?? DEFAULT_PP_CLIENT_ID,
    authMode: current?.authMode ?? "deviceCode",
  };
}

async function runAuthStep(
  current: DirectLineConfig | undefined,
): Promise<{ authMode: AuthMode; clientId: string } | undefined> {
  const modePick = await vscode.window.showQuickPick(
    [
      {
        label: "Device code",
        description: "Recommended for local runs",
        detail: "Interactive sign-in; no client secret stored on disk",
        payload: "deviceCode" as AuthMode,
      },
      {
        label: "Client credentials",
        description: "CI / unattended",
        detail:
          "Requires a service principal with CopilotStudio.Copilots.Invoke",
        payload: "clientCredentials" as AuthMode,
      },
    ],
    { title: "Agent Workbench: authentication mode", ignoreFocusOut: true },
  );
  if (!modePick) return undefined;

  const clientIdChoice = await vscode.window.showQuickPick(
    [
      {
        label: "Use the Agent Workbench Test Harness app registration",
        description: DEFAULT_PP_CLIENT_ID,
        detail:
          "Requires CopilotStudio.Copilots.Invoke delegated permission + admin consent in this tenant",
        payload: "default",
      },
      {
        label: "Advanced › Use my own app registration…",
        description: "Pick from your owned applications",
        payload: "custom",
      },
    ],
    { title: "Agent Workbench: client id", ignoreFocusOut: true },
  );
  if (!clientIdChoice) return undefined;

  let clientId = current?.clientId ?? DEFAULT_PP_CLIENT_ID;
  if (clientIdChoice.payload === "custom") {
    const entered = await vscode.window.showInputBox({
      title: "Agent Workbench: app registration client id",
      prompt:
        "Paste the application (client) id of your Entra app registration. It must have CopilotStudio.Copilots.Invoke delegated permission granted.",
      value: clientId,
      ignoreFocusOut: true,
      validateInput: (v) =>
        /^[0-9a-fA-F-]{36}$/.test(v.trim())
          ? null
          : "Must be a client id GUID.",
    });
    if (!entered) return undefined;
    clientId = entered.trim();
  } else {
    clientId = DEFAULT_PP_CLIENT_ID;
  }

  return { authMode: modePick.payload, clientId };
}

async function runJudgeStep(
  current: JudgeConfig | undefined,
  opts: WizardOptions,
): Promise<JudgeConfig | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: "None",
        description: "Deterministic checks only",
        payload: "none" as const,
      },
      {
        label: "Azure OpenAI",
        description: "Structured JSON judge — recommended",
        payload: "azureOpenAI" as const,
      },
      {
        label: "CPS judge agent (Phase 4)",
        description: "In-tenant judge over Direct Line",
        payload: "cpsJudgeAgent" as const,
      },
    ],
    {
      title: "Agent Workbench: judge provider",
      ignoreFocusOut: true,
      placeHolder: current ? `Current: ${current.provider}` : undefined,
    },
  );
  if (!choice) return undefined;

  if (choice.payload === "none") {
    return { provider: "none" };
  }
  if (choice.payload === "cpsJudgeAgent") {
    const schemaName = await vscode.window.showInputBox({
      title: "CPS judge agent schema name",
      prompt:
        "Bot schema name of the second CPS agent that will act as the judge.",
      ignoreFocusOut: true,
    });
    if (!schemaName) return undefined;
    return { provider: "cpsJudgeAgent", botSchemaName: schemaName };
  }
  return await runAzureOpenAISubWizard(
    current?.provider === "azureOpenAI" ? current : undefined,
    opts,
  );
}

async function runAzureOpenAISubWizard(
  current: AzureOpenAIJudgeConfig | undefined,
  opts: WizardOptions,
): Promise<AzureOpenAIJudgeConfig | undefined> {
  const subs = await safeDiscover(() =>
    armDiscovery.listSubscriptions(authProvider.forArm()),
  );
  if (!subs) return undefined;
  if (subs.length === 0) {
    vscode.window.showErrorMessage(
      "No Azure subscriptions visible to your account.",
    );
    return undefined;
  }
  const subPick = await vscode.window.showQuickPick(
    subs.map((s) => ({
      label: s.displayName,
      description: s.subscriptionId,
      payload: s,
    })),
    { title: "Agent Workbench: pick Azure subscription", ignoreFocusOut: true },
  );
  if (!subPick) return undefined;

  const accounts = await safeDiscover(() =>
    armDiscovery.listOpenAIAccounts(
      authProvider.forArm(),
      subPick.payload.subscriptionId,
    ),
  );
  if (!accounts) return undefined;
  if (accounts.length === 0) {
    const openPortal = "Open Azure portal";
    const choice = await vscode.window.showWarningMessage(
      "No Azure OpenAI (or AIServices) accounts found in this subscription.",
      openPortal,
    );
    if (choice === openPortal) {
      vscode.env.openExternal(
        vscode.Uri.parse(
          "https://portal.azure.com/#create/Microsoft.CognitiveServicesOpenAI",
        ),
      );
    }
    return undefined;
  }
  const accountPick = await vscode.window.showQuickPick(
    accounts.map((a) => ({
      label: a.name,
      description: a.endpoint ?? "",
      detail: `${a.location}${a.sku ? " · " + a.sku : ""}`,
      payload: a,
    })),
    { title: "Agent Workbench: pick Azure OpenAI resource", ignoreFocusOut: true },
  );
  if (!accountPick) return undefined;

  const deployments = await safeDiscover(() =>
    armDiscovery.listDeployments(authProvider.forArm(), accountPick.payload),
  );
  if (!deployments) return undefined;
  const eligible = deployments.filter((d) => d.supportsStructuredOutput);
  if (eligible.length === 0) {
    vscode.window.showWarningMessage(
      "No deployments support structured JSON output. Deploy a gpt-4o, gpt-4.1, o3, or o4 model and re-run.",
    );
    return undefined;
  }
  const deploymentPick = await vscode.window.showQuickPick(
    eligible.map((d) => ({
      label: d.name,
      description: d.modelName,
      detail: d.modelVersion,
      payload: d,
    })),
    { title: "Agent Workbench: pick model deployment", ignoreFocusOut: true },
  );
  if (!deploymentPick) return undefined;

  const apiVersionPick = await vscode.window.showQuickPick(
    SUPPORTED_AOAI_API_VERSIONS.map((v) => ({
      label: v,
      description: v === DEFAULT_AOAI_API_VERSION ? "default" : undefined,
      payload: v,
    })),
    { title: "Agent Workbench: Azure OpenAI API version", ignoreFocusOut: true },
  );
  if (!apiVersionPick) return undefined;

  const authPick = await vscode.window.showQuickPick(
    [
      {
        label: "Entra ID (signed-in user)",
        description: "Recommended",
        detail:
          "Uses your VS Code Microsoft session to obtain a Cognitive Services token",
        payload: "entra" as AzureOpenAIAuthMode,
      },
      {
        label: "API key",
        description:
          "Stored in VS Code SecretStorage; never written to test-config.json",
        payload: "apiKey" as AzureOpenAIAuthMode,
      },
    ],
    { title: "Agent Workbench: Azure OpenAI authentication", ignoreFocusOut: true },
  );
  if (!authPick) return undefined;

  if (authPick.payload === "apiKey") {
    const key = await vscode.window.showInputBox({
      title: "Azure OpenAI API key",
      password: true,
      ignoreFocusOut: true,
      prompt: "Stored securely in VS Code SecretStorage.",
    });
    if (!key) return undefined;
    const store = createSecretStore(opts.secrets, opts.workspaceFolder);
    await store.setAzureOpenAIKey(key);
  }

  return {
    provider: "azureOpenAI",
    endpoint: accountPick.payload.endpoint ?? "",
    deployment: deploymentPick.payload.name,
    apiVersion: apiVersionPick.payload,
    authMode: authPick.payload,
  };
}

async function safeDiscover<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    vscode.window.showErrorMessage(`Agent Workbench: ${(err as Error).message}`);
    return undefined;
  }
}

function renderSummary(
  draft: Partial<TestConfig>,
  agent: { displayName: string; agentFolder: string; botSchemaName: string },
): string {
  const dl = draft.directLine;
  const j = draft.judge;
  const lines: string[] = [];
  lines.push(`Agent under test: ${agent.displayName}`);
  lines.push(`  folder: ${agent.agentFolder}`);
  lines.push(`  bot schema name: ${agent.botSchemaName}`);
  lines.push("");
  lines.push(`Direct Line:`);
  lines.push(
    `  environment hostname: ${dl?.environmentHostname ?? "(not set)"}`,
  );
  lines.push(`  tenant id: ${dl?.tenantId ?? "(not set)"}`);
  lines.push(`  client id: ${dl?.clientId ?? "(not set)"}`);
  lines.push(`  auth mode: ${dl?.authMode ?? "(not set)"}`);
  lines.push("");
  lines.push(`Judge: ${j?.provider ?? "(not set)"}`);
  if (j?.provider === "azureOpenAI") {
    lines.push(`  endpoint: ${j.endpoint}`);
    lines.push(`  deployment: ${j.deployment}`);
    lines.push(`  api version: ${j.apiVersion}`);
    lines.push(`  auth: ${j.authMode}`);
  }
  return lines.join("\n");
}

async function ensureSuiteAgentBlock(
  workspaceRoot: string,
  agent: { displayName: string; agentFolder: string; botSchemaName: string },
): Promise<void> {
  const file = path.join(
    workspaceRoot,
    "Requirements",
    "tests",
    "agent-tests.json",
  );
  try {
    const text = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    parsed.agent = agent;
    await fs.writeFile(file, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      // do not fail wizard for unreadable suite; the run command will handle this.
    }
  }
}

/**
 * Create a draft starter suite next to the agent if none exists. Keeps the
 * "Run Agent Tests" command friction-free immediately after configuration.
 */
async function ensureStarterSuiteExists(
  workspaceRoot: string,
  agent: { displayName: string; agentFolder: string; botSchemaName: string },
): Promise<void> {
  const dir = path.join(workspaceRoot, "Requirements", "tests");
  const file = path.join(dir, "agent-tests.json");
  try {
    await fs.access(file);
    return; // already there
  } catch {
    // create it
  }
  const suite = generateStarterSuite({
    agentFolder: agent.agentFolder,
    displayName: agent.displayName,
    botSchemaName: agent.botSchemaName,
  });
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(suite, null, 2) + "\n", "utf-8");
}
