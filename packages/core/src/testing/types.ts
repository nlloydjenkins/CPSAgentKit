// Shared types for the CPSAgentKit agent testing harness.
// See: Research/Agent Testing Low Level Design.md

export type TestSuiteStatus = "draft" | "reviewed";

export interface TestAgentTarget {
  displayName: string;
  agentFolder: string;
  botSchemaName: string;
}

export interface TestSuiteDefaults {
  freshConversationPerScenario?: boolean;
  maxTurns?: number;
  timeoutMs?: number;
  maxParallelScenarios?: number;
}

export interface ScenarioTurn {
  user: string;
}

export interface ScenarioExpected {
  mustContain?: string[];
  mustNotContain?: string[];
  mustMatch?: string[];
  expectedToolNames?: string[];
  judgeHints?: Record<string, unknown>;
}

export interface ScenarioThresholds {
  deterministicPassRequired?: boolean;
  minimumOverallScore?: number;
  minimumCriterionScore?: Record<string, number>;
}

export interface TestScenario {
  id: string;
  title: string;
  category?: string;
  priority?: "low" | "medium" | "high";
  turns: ScenarioTurn[];
  expected?: ScenarioExpected;
  rubric?: string[];
  thresholds?: ScenarioThresholds;
  requireTrace?: boolean;
}

export interface TestSuite {
  schemaVersion: string;
  status: TestSuiteStatus;
  agent: TestAgentTarget;
  defaults?: TestSuiteDefaults;
  scenarios: TestScenario[];
}

export interface RubricCriterion {
  id: string;
  label: string;
  scale: string;
  description: string;
}

export interface Rubric {
  schemaVersion: string;
  criteria: RubricCriterion[];
}

// ─────────────────────────────────────────────────────────────
//  Direct Line
// ─────────────────────────────────────────────────────────────

export type TokenProvider = () => Promise<string>;

export interface RetryPolicy {
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
}

export interface DirectLineActivity {
  type: string;
  id?: string;
  from?: { id?: string; name?: string; role?: string };
  text?: string;
  attachments?: unknown[];
  value?: unknown;
  channelData?: unknown;
  timestamp?: string;
  [key: string]: unknown;
}

export interface DirectLineClientOptions {
  environmentHostname: string;
  botSchemaName: string;
  tokenProvider: TokenProvider;
  retry?: RetryPolicy;
  fetchImpl?: typeof fetch;
}

export interface SendTurnInput {
  conversationId: string;
  text: string;
  timeoutMs: number;
}

export interface DirectLineTurnResult {
  activities: DirectLineActivity[];
  raw: unknown;
}

export interface DirectLineClient {
  createConversation(): Promise<{ conversationId: string }>;
  sendTurn(input: SendTurnInput): Promise<DirectLineTurnResult>;
}

// ─────────────────────────────────────────────────────────────
//  Evaluation results
// ─────────────────────────────────────────────────────────────

export type ScenarioStatus = "passed" | "failed" | "inconclusive" | "error";

export interface DeterministicCheckResult {
  name: string;
  status: "passed" | "failed" | "inconclusive";
  detail?: string;
}

export interface DeterministicEvaluationResult {
  status: "passed" | "failed" | "inconclusive";
  checks: DeterministicCheckResult[];
}

export interface JudgeCriterionScore {
  id: string;
  score: number;
  reason: string;
}

export interface JudgeFinding {
  severity: "low" | "medium" | "high";
  message: string;
}

export interface JudgeEvaluationResult {
  overallScore: number;
  passed: boolean;
  criteria: JudgeCriterionScore[];
  findings: JudgeFinding[];
  /** Set when the judge returned non-conforming output. */
  inconclusiveReason?: string;
}

export interface ConversationTurn {
  role: "user" | "agent";
  text: string;
}

export interface JudgeEvaluationInput {
  scenario: TestScenario;
  transcript: ConversationTurn[];
  finalResponse: string;
  rubric: Rubric;
  rawActivities: unknown[];
}

export interface JudgeProvider {
  evaluate(input: JudgeEvaluationInput): Promise<JudgeEvaluationResult>;
}

export interface TestError {
  code: string;
  message: string;
}

export interface ScenarioResult {
  id: string;
  title: string;
  status: ScenarioStatus;
  durationMs: number;
  finalResponse: string;
  deterministic: DeterministicEvaluationResult;
  judge?: JudgeEvaluationResult;
  /** Path to raw activities JSON, relative to the run directory. */
  activityFile: string;
  errors: TestError[];
}

export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  inconclusive: number;
  errored: number;
}

export interface TestRunResult {
  schemaVersion: "1.0";
  runId: string;
  startedAt: string;
  completedAt: string;
  agent: TestAgentTarget;
  summary: TestRunSummary;
  scenarios: ScenarioResult[];
}
