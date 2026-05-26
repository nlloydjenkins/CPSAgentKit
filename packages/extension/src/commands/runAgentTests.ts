import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import {
  buildTimestampFolder,
  defaultRubric,
  generateStarterSuite,
  parseRubric,
  parseTestSuite,
  parseTextPromptsSuite,
  runTestSuite,
  writeReports,
  NoneJudgeProvider,
  AzureOpenAIJudge,
} from "@cpsagentkit/core";
import type {
  JudgeProvider,
  Rubric,
  ScenarioResult,
  TestSuite,
} from "@cpsagentkit/core";
import { requireWorkspaceRoot } from "../ui/uiUtils.js";
import {
  ensureGitignore,
  readTestConfig,
  isComplete,
} from "../services/testing/testConfig.js";
import type { TestConfig } from "../services/testing/testConfig.js";
import { authProvider } from "../services/testing/authProvider.js";
import { createSecretStore } from "../services/testing/secretStore.js";
import {
  getTestingChannel,
  logInfo,
  withErrorSurface,
} from "../services/testing/diagnostics.js";
import { runSetupWizard, pickAgent } from "../services/testing/setupWizard.js";
import { isDirectLineSignInError } from "../services/testing/msalDirectLine.js";

const ONE_TIME_WARNING_KEY = "cpsAgentKit.judgeTransmissionAcknowledged";

interface RunAgentTestsArgs {
  agentFolder?: string;
}

export async function runAgentTestsCommand(
  context: vscode.ExtensionContext,
  args?: RunAgentTestsArgs,
): Promise<void> {
  await withErrorSurface("runAgentTests", () =>
    runAgentTestsInner(context, args),
  );
}

async function runAgentTestsInner(
  context: vscode.ExtensionContext,
  args?: RunAgentTestsArgs,
): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) return;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;
  logInfo(`Workspace root: ${root}`);

  const initialConfig = await readTestConfig(root);
  logInfo(
    `Loaded test-config.json: ${
      initialConfig ? `complete=${isComplete(initialConfig)}` : "missing"
    }`,
  );
  let config: TestConfig;
  if (isComplete(initialConfig)) {
    config = initialConfig;
  } else {
    const result = await runSetupWizard({
      workspaceRoot: root,
      workspaceFolder,
      secrets: context.secrets,
      startStep: "tenant",
      preselectAgentFolder: args?.agentFolder,
    });
    if (!result.saved || !result.config) {
      return;
    }
    config = result.config;
  }

  // Defensive: older configs may have stored the Dataverse host instead of the
  // Power Platform API host. Re-prompt the environment step so we get the
  // correct surface for Copilot Studio Direct Line.
  if (
    !/\.environment\.api\.powerplatform\.com$/i.test(
      config.directLine.environmentHostname,
    )
  ) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: stored environment hostname is not a Power Platform API host. Re-running the environment step.",
    );
    const result = await runSetupWizard({
      workspaceRoot: root,
      workspaceFolder,
      secrets: context.secrets,
      startStep: "environment",
    });
    if (!result.saved || !result.config) {
      return;
    }
    config = result.config;
  }

  // Defensive: the old Power Platform CLI public client id cannot mint
  // CopilotStudio.Copilots.Invoke tokens (AADSTS65002 pre-auth error).
  // Force re-running the auth step to switch to a permitted app registration.
  if (config.directLine.clientId === "1950a258-227b-4e31-a9cf-717495945fc2") {
    vscode.window.showWarningMessage(
      "CPSAgentKit: stored clientId is the Power Platform CLI app, which is not pre-authorised for CopilotStudio.Copilots.Invoke. Re-running the authentication step.",
    );
    const result = await runSetupWizard({
      workspaceRoot: root,
      workspaceFolder,
      secrets: context.secrets,
      startStep: "auth",
    });
    if (!result.saved || !result.config) {
      return;
    }
    config = result.config;
  }

  const suitePath = path.join(
    root,
    "Requirements",
    "tests",
    "agent-tests.json",
  );
  const promptsTxtPath = path.join(
    root,
    "Requirements",
    "tests",
    "prompts.txt",
  );
  let suite: TestSuite;
  let suiteWarnings: string[] = [];

  const jsonExists = await fileExists(suitePath);
  const txtExists = await fileExists(promptsTxtPath);

  if (jsonExists) {
    const suiteText = await fs.readFile(suitePath, "utf-8");
    try {
      const parsed = parseTestSuite(JSON.parse(suiteText));
      suite = parsed.value;
      suiteWarnings = parsed.warnings;
    } catch (err) {
      vscode.window.showErrorMessage(
        `CPSAgentKit: test suite invalid — ${(err as Error).message}`,
      );
      return;
    }
  } else if (txtExists) {
    const text = await fs.readFile(promptsTxtPath, "utf-8");
    const agentTarget = await pickAgent(root, args?.agentFolder);
    if (!agentTarget) {
      vscode.window.showErrorMessage(
        "CPSAgentKit: cannot run prompts.txt — no CPS agent folder selected.",
      );
      return;
    }
    suite = parseTextPromptsSuite(text, { agent: agentTarget });
    if (suite.scenarios.length === 0) {
      vscode.window.showErrorMessage(
        "CPSAgentKit: prompts.txt contains no prompts (only blank lines or comments).",
      );
      return;
    }
    logInfo(
      `Loaded ${suite.scenarios.length} prompt(s) from Requirements/tests/prompts.txt for ${agentTarget.botSchemaName}.`,
    );
  } else {
    const proceed = await vscode.window.showInformationMessage(
      "CPSAgentKit: no test suite found at Requirements/tests/agent-tests.json or prompts.txt. Generate a starter suite now?",
      { modal: true },
      "Generate",
    );
    if (proceed !== "Generate") return;
    const suiteText = await generateStarterSuiteForWorkspace(
      root,
      args?.agentFolder,
    );
    try {
      const parsed = parseTestSuite(JSON.parse(suiteText));
      suite = parsed.value;
      suiteWarnings = parsed.warnings;
    } catch (err) {
      vscode.window.showErrorMessage(
        `CPSAgentKit: test suite invalid — ${(err as Error).message}`,
      );
      return;
    }
  }

  if (suite.status === "draft") {
    vscode.window.showWarningMessage(
      'CPSAgentKit: running a DRAFT test suite. Review and mark status as "reviewed" before relying on results.',
    );
  }

  const rubric = await loadRubricOrDefault(root);

  // One-time warning before transcripts leave the machine.
  if (config.judge.provider === "azureOpenAI") {
    const acknowledged = context.workspaceState.get<boolean>(
      ONE_TIME_WARNING_KEY,
      false,
    );
    if (!acknowledged) {
      const choice = await vscode.window.showWarningMessage(
        "CPSAgentKit will send the agent transcript and final response to your configured Azure OpenAI deployment for judging. Continue?",
        { modal: true },
        "Continue",
        "Cancel",
      );
      if (choice !== "Continue") return;
      await context.workspaceState.update(ONE_TIME_WARNING_KEY, true);
    }
  }

  const judge = await buildJudge(
    config,
    rubric,
    workspaceFolder,
    context.secrets,
  );

  const runDir = path.join(
    root,
    ".cpsagentkit",
    "test-results",
    buildTimestampFolder(),
  );
  await fs.mkdir(runDir, { recursive: true });
  await ensureGitignore(root);

  // Pre-warm the Direct Line token before launching scenarios so the user
  // sees at most one device-code prompt, no matter how many scenarios run.
  const directLineTokenProvider = authProvider.forDirectLine({
    clientId: config.directLine.clientId,
    tenantId: config.directLine.tenantId,
    secrets: context.secrets,
  });
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "CPSAgentKit: signing in to Direct Line…",
        cancellable: false,
      },
      async () => {
        await directLineTokenProvider();
      },
    );
  } catch (err) {
    await showDirectLineSignInFailure(err);
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `CPSAgentKit: running ${suite.scenarios.length} scenarios…`,
      cancellable: false,
    },
    async (progress) => {
      const completedIds = new Set<string>();
      const run = await runTestSuite({
        suite,
        rubric,
        directLine: {
          environmentHostname: config.directLine.environmentHostname,
          tokenProvider: directLineTokenProvider,
          retry: config.retry,
        },
        judge,
        runDir,
        reporter: (event) => {
          if (event.kind === "scenarioStart") {
            progress.report({
              message: `${event.index + 1}/${event.total}: ${event.scenarioId}`,
            });
          } else if (event.kind === "scenarioEnd") {
            completedIds.add(event.result.id);
            progress.report({
              message: summariseProgress(
                event.result,
                completedIds.size,
                suite.scenarios.length,
              ),
            });
          }
        },
      });

      await writeReports(runDir, run, suiteWarnings);
      const reportUri = vscode.Uri.file(path.join(runDir, "report.md"));
      await vscode.window.showTextDocument(reportUri, { preview: false });
    },
  );
}

function summariseProgress(
  result: ScenarioResult,
  done: number,
  total: number,
): string {
  return `${done}/${total} done — last: ${result.id} (${result.status})`;
}

async function showDirectLineSignInFailure(err: unknown): Promise<void> {
  const classified = isDirectLineSignInError(err);
  const headline = classified
    ? `CPSAgentKit: Direct Line sign-in failed (${err.code}).`
    : "CPSAgentKit: Direct Line sign-in failed.";
  const hint = classified
    ? err.hint
    : err instanceof Error
      ? err.message
      : String(err);
  const detail = `${hint}\n\nFull MSAL error is in the 'CPSAgentKit (Testing)' output channel.`;

  const RESET = "Reset Direct Line Sign-in";
  const OUTPUT = "Show Output";
  const choice = await vscode.window.showErrorMessage(
    headline,
    { modal: true, detail },
    RESET,
    OUTPUT,
  );
  if (choice === RESET) {
    await vscode.commands.executeCommand("cpsAgentKit.resetDirectLineSignin");
  } else if (choice === OUTPUT) {
    getTestingChannel().show(true);
  }
}

async function loadRubricOrDefault(workspaceRoot: string): Promise<Rubric> {
  const rubricPath = path.join(
    workspaceRoot,
    "Requirements",
    "tests",
    "rubric.json",
  );
  try {
    const text = await fs.readFile(rubricPath, "utf-8");
    return parseRubric(JSON.parse(text)).value;
  } catch {
    return defaultRubric();
  }
}

async function buildJudge(
  config: TestConfig,
  _rubric: Rubric,
  workspaceFolder: vscode.WorkspaceFolder,
  secrets: vscode.SecretStorage,
): Promise<JudgeProvider> {
  if (config.judge.provider !== "azureOpenAI") {
    return new NoneJudgeProvider();
  }
  const judge = config.judge;
  const store = createSecretStore(secrets, workspaceFolder);
  const credentialProvider = async (): Promise<{
    kind: "apiKey" | "bearer";
    value: string;
  }> => {
    if (judge.authMode === "apiKey") {
      const key = await store.getAzureOpenAIKey();
      if (!key) {
        throw new Error(
          "Azure OpenAI API key is missing. Re-run Connect Azure OpenAI Judge.",
        );
      }
      return { kind: "apiKey", value: key };
    }
    return { kind: "bearer", value: await authProvider.forAzureOpenAI()() };
  };
  return new AzureOpenAIJudge({
    endpoint: judge.endpoint,
    deployment: judge.deployment,
    apiVersion: judge.apiVersion,
    credentialProvider,
  });
}

async function generateStarterSuiteForWorkspace(
  workspaceRoot: string,
  preselected?: string,
): Promise<string> {
  const dir = path.join(workspaceRoot, "Requirements", "tests");
  await fs.mkdir(dir, { recursive: true });

  // Look up the agent target from existing config, falling back to preselected.
  const config = await readTestConfig(workspaceRoot);
  const folder = preselected ?? "";
  const suite = generateStarterSuite({
    agentFolder: folder,
    displayName: folder || "Agent",
    botSchemaName:
      (config &&
        config.directLine &&
        (config as TestConfig).directLine?.environmentHostname) ||
      folder,
  });
  const text = JSON.stringify(suite, null, 2) + "\n";
  await fs.writeFile(path.join(dir, "agent-tests.json"), text, "utf-8");
  return text;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
