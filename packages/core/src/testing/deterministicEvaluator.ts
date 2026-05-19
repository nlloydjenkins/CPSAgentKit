// Deterministic assertions over the final assistant-visible response.
import type {
  DeterministicCheckResult,
  DeterministicEvaluationResult,
  DirectLineActivity,
  TestScenario,
} from "./types.js";

export interface DeterministicInput {
  scenario: TestScenario;
  finalResponse: string;
  activities: DirectLineActivity[];
  turnCount: number;
  maxTurns?: number;
}

function rollupStatus(
  checks: DeterministicCheckResult[],
): "passed" | "failed" | "inconclusive" {
  if (checks.some((c) => c.status === "failed")) {
    return "failed";
  }
  if (checks.every((c) => c.status === "passed")) {
    return "passed";
  }
  return "inconclusive";
}

export function evaluateDeterministic(
  input: DeterministicInput,
): DeterministicEvaluationResult {
  const { scenario, finalResponse, activities, turnCount, maxTurns } = input;
  const checks: DeterministicCheckResult[] = [];

  const lower = finalResponse.toLowerCase();

  checks.push({
    name: "nonEmptyResponse",
    status: finalResponse.trim().length > 0 ? "passed" : "failed",
    detail:
      finalResponse.trim().length > 0
        ? undefined
        : "Agent returned no assistant-visible text.",
  });

  const expected = scenario.expected ?? {};

  if (expected.mustContain && expected.mustContain.length > 0) {
    const missing = expected.mustContain.filter(
      (needle) => !lower.includes(needle.toLowerCase()),
    );
    checks.push({
      name: "mustContain",
      status: missing.length === 0 ? "passed" : "failed",
      detail:
        missing.length === 0
          ? undefined
          : `Missing substrings: ${missing.map((m) => `"${m}"`).join(", ")}`,
    });
  }

  if (expected.mustNotContain && expected.mustNotContain.length > 0) {
    const offending = expected.mustNotContain.filter((needle) =>
      lower.includes(needle.toLowerCase()),
    );
    checks.push({
      name: "mustNotContain",
      status: offending.length === 0 ? "passed" : "failed",
      detail:
        offending.length === 0
          ? undefined
          : `Forbidden substrings present: ${offending.map((m) => `"${m}"`).join(", ")}`,
    });
  }

  if (expected.mustMatch && expected.mustMatch.length > 0) {
    const failing = expected.mustMatch.filter(
      (pattern) => !new RegExp(pattern).test(finalResponse),
    );
    checks.push({
      name: "mustMatch",
      status: failing.length === 0 ? "passed" : "failed",
      detail:
        failing.length === 0
          ? undefined
          : `Regexes not matched: ${failing.map((m) => `/${m}/`).join(", ")}`,
    });
  }

  if (expected.expectedToolNames && expected.expectedToolNames.length > 0) {
    const traceNames = activities
      .filter((a) => a.type === "trace")
      .flatMap((a) => collectToolNames(a));
    if (traceNames.length === 0) {
      checks.push({
        name: "expectedToolNames",
        status: scenario.requireTrace ? "failed" : "inconclusive",
        detail: "No trace activities found to verify tool usage.",
      });
    } else {
      const missing = expected.expectedToolNames.filter(
        (name) => !traceNames.includes(name),
      );
      checks.push({
        name: "expectedToolNames",
        status: missing.length === 0 ? "passed" : "failed",
        detail:
          missing.length === 0
            ? undefined
            : `Expected tools not observed: ${missing.join(", ")}`,
      });
    }
  }

  if (typeof maxTurns === "number") {
    checks.push({
      name: "maxTurns",
      status: turnCount <= maxTurns ? "passed" : "failed",
      detail:
        turnCount <= maxTurns
          ? undefined
          : `Used ${turnCount} turns, allowed ${maxTurns}.`,
    });
  }

  return { status: rollupStatus(checks), checks };
}

function collectToolNames(activity: DirectLineActivity): string[] {
  const names: string[] = [];
  const value = activity.value as Record<string, unknown> | undefined;
  if (value && typeof value === "object") {
    const candidates = ["toolName", "name", "operationName"];
    for (const key of candidates) {
      const v = value[key];
      if (typeof v === "string" && v) {
        names.push(v);
      }
    }
  }
  if (typeof activity.name === "string" && activity.name) {
    names.push(activity.name);
  }
  return names;
}
