// Test runner: bounded concurrency over scenarios; pure core, no VS Code deps.
import { promises as fs } from "fs";
import * as path from "path";
import { createDirectLineClient } from "./directLineClient.js";
import { evaluateDeterministic } from "./deterministicEvaluator.js";
import type {
  ConversationTurn,
  DirectLineActivity,
  JudgeProvider,
  RetryPolicy,
  Rubric,
  ScenarioResult,
  TestRunResult,
  TestRunSummary,
  TestScenario,
  TestSuite,
  TokenProvider,
} from "./types.js";

export interface RunTestSuiteOptions {
  suite: TestSuite;
  rubric?: Rubric;
  directLine: {
    environmentHostname: string;
    tokenProvider: TokenProvider;
    retry?: RetryPolicy;
  };
  judge?: JudgeProvider;
  runDir: string;
  /** Optional reporter for live progress (e.g. VS Code progress notification). */
  reporter?: (event: RunnerEvent) => void;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export type RunnerEvent =
  | { kind: "scenarioStart"; scenarioId: string; index: number; total: number }
  | { kind: "scenarioEnd"; result: ScenarioResult }
  | { kind: "log"; message: string };

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TURNS = 6;
const DEFAULT_PARALLEL = 4;

export async function runTestSuite(
  opts: RunTestSuiteOptions,
): Promise<TestRunResult> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const suite = opts.suite;
  const defaults = suite.defaults ?? {};
  const timeoutMs = defaults.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTurns = defaults.maxTurns ?? DEFAULT_MAX_TURNS;
  const parallel = Math.max(
    1,
    defaults.maxParallelScenarios ?? DEFAULT_PARALLEL,
  );

  await fs.mkdir(path.join(opts.runDir, "activities"), { recursive: true });

  const client = createDirectLineClient({
    environmentHostname: opts.directLine.environmentHostname,
    botSchemaName: suite.agent.botSchemaName,
    tokenProvider: opts.directLine.tokenProvider,
    retry: opts.directLine.retry,
    fetchImpl: opts.fetchImpl,
  });

  const results: ScenarioResult[] = new Array(suite.scenarios.length);
  const total = suite.scenarios.length;
  let nextIndex = 0;

  const workers: Promise<void>[] = [];
  const workerCount = Math.min(parallel, total);
  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = nextIndex++;
          if (i >= total) {
            return;
          }
          const scenario = suite.scenarios[i];
          opts.reporter?.({
            kind: "scenarioStart",
            scenarioId: scenario.id,
            index: i,
            total,
          });
          const result = await runScenario({
            scenario,
            client,
            timeoutMs,
            maxTurns,
            rubric: opts.rubric,
            judge: opts.judge,
            runDir: opts.runDir,
            now,
          });
          results[i] = result;
          opts.reporter?.({ kind: "scenarioEnd", result });
        }
      })(),
    );
  }
  await Promise.all(workers);

  const summary = summarise(results);
  const completed = now();
  return {
    schemaVersion: "1.0",
    runId: deriveRunId(opts.runDir),
    startedAt: started.toISOString(),
    completedAt: completed.toISOString(),
    agent: suite.agent,
    summary,
    scenarios: results,
  };
}

function summarise(results: ScenarioResult[]): TestRunSummary {
  const summary: TestRunSummary = {
    total: results.length,
    passed: 0,
    failed: 0,
    inconclusive: 0,
    errored: 0,
  };
  for (const r of results) {
    switch (r.status) {
      case "passed":
        summary.passed++;
        break;
      case "failed":
        summary.failed++;
        break;
      case "inconclusive":
        summary.inconclusive++;
        break;
      case "error":
        summary.errored++;
        break;
    }
  }
  return summary;
}

function deriveRunId(runDir: string): string {
  return path.basename(runDir);
}

interface RunScenarioOptions {
  scenario: TestScenario;
  client: ReturnType<typeof createDirectLineClient>;
  timeoutMs: number;
  maxTurns: number;
  rubric?: Rubric;
  judge?: JudgeProvider;
  runDir: string;
  now: () => Date;
}

async function runScenario(opts: RunScenarioOptions): Promise<ScenarioResult> {
  const { scenario, client, timeoutMs, maxTurns, rubric, judge, runDir, now } =
    opts;
  const start = now().getTime();
  const activities: DirectLineActivity[] = [];
  const transcript: ConversationTurn[] = [];

  let finalResponse = "";
  let conversationId: string | undefined;

  try {
    const created = await client.createConversation();
    conversationId = created.conversationId;
    for (const turn of scenario.turns) {
      transcript.push({ role: "user", text: turn.user });
      const result = await client.sendTurn({
        conversationId,
        text: turn.user,
        timeoutMs,
      });
      activities.push(...result.activities);
      const agentText = extractAssistantText(result.activities);
      if (agentText) {
        transcript.push({ role: "agent", text: agentText });
        finalResponse = agentText;
      }
    }
  } catch (err) {
    const activityFile = await persistActivities(
      runDir,
      scenario.id,
      activities,
    );
    return {
      id: scenario.id,
      title: scenario.title,
      status: "error",
      durationMs: now().getTime() - start,
      finalResponse,
      deterministic: { status: "inconclusive", checks: [] },
      activityFile,
      errors: [
        {
          code: (err as { code?: string }).code ?? "DirectLineError",
          message: (err as Error).message,
        },
      ],
    };
  }

  const deterministic = evaluateDeterministic({
    scenario,
    finalResponse,
    activities,
    turnCount: scenario.turns.length,
    maxTurns,
  });

  let judgeResult;
  if (judge && rubric) {
    judgeResult = await judge.evaluate({
      scenario,
      transcript,
      finalResponse,
      rubric,
      rawActivities: activities,
    });
  }

  const activityFile = await persistActivities(runDir, scenario.id, activities);

  const status = decideStatus(scenario, deterministic.status, judgeResult);

  return {
    id: scenario.id,
    title: scenario.title,
    status,
    durationMs: now().getTime() - start,
    finalResponse,
    deterministic,
    judge: judgeResult,
    activityFile,
    errors: [],
  };
}

function decideStatus(
  scenario: TestScenario,
  deterministicStatus: "passed" | "failed" | "inconclusive",
  judge?: {
    overallScore: number;
    passed: boolean;
    criteria: { id: string; score: number }[];
    inconclusiveReason?: string;
  },
): ScenarioResult["status"] {
  const requireDeterministic =
    scenario.thresholds?.deterministicPassRequired ?? true;
  if (deterministicStatus === "failed" && requireDeterministic) {
    return "failed";
  }

  if (judge && !judge.inconclusiveReason) {
    const minOverall = scenario.thresholds?.minimumOverallScore;
    if (typeof minOverall === "number" && judge.overallScore < minOverall) {
      return "failed";
    }
    const minPerCriterion = scenario.thresholds?.minimumCriterionScore;
    if (minPerCriterion) {
      for (const [id, minScore] of Object.entries(minPerCriterion)) {
        const got = judge.criteria.find((c) => c.id === id);
        if (got && got.score < minScore) {
          return "failed";
        }
      }
    }
    if (!judge.passed) {
      return "failed";
    }
  }

  if (judge?.inconclusiveReason) {
    return "inconclusive";
  }
  if (deterministicStatus === "inconclusive") {
    return "inconclusive";
  }
  return "passed";
}

function extractAssistantText(activities: DirectLineActivity[]): string {
  // Return the concatenated text of the last group of bot messages.
  const messages = activities.filter(
    (a) =>
      a.type === "message" &&
      a.from?.role !== "user" &&
      typeof a.text === "string" &&
      a.text,
  );
  if (messages.length === 0) {
    return "";
  }
  return messages.map((m) => m.text as string).join("\n");
}

async function persistActivities(
  runDir: string,
  scenarioId: string,
  activities: DirectLineActivity[],
): Promise<string> {
  const safeName = scenarioId.replace(/[^a-z0-9._-]/gi, "_");
  const relative = path.join("activities", `${safeName}.json`);
  const fullPath = path.join(runDir, relative);
  await fs.writeFile(fullPath, JSON.stringify(activities, null, 2), "utf-8");
  return relative.replace(/\\/g, "/");
}
