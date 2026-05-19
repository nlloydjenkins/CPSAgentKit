// Parse and validate agent-tests.json and rubric.json.
import type { Rubric, TestSuite } from "./types.js";

const SUPPORTED_MAJOR = 1;

export interface ParseResult<T> {
  value: T;
  warnings: string[];
}

function parseSchemaVersion(raw: unknown): { major: number; minor: number } {
  if (typeof raw !== "string") {
    throw new Error(
      'schemaVersion is required and must be a string (e.g. "1.0").',
    );
  }
  const match = raw.match(/^(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`schemaVersion "${raw}" is not in MAJOR.MINOR form.`);
  }
  return { major: Number(match[1]), minor: Number(match[2]) };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function parseTestSuite(input: unknown): ParseResult<TestSuite> {
  if (!input || typeof input !== "object") {
    throw new Error("Test suite must be a JSON object.");
  }
  const obj = input as Record<string, unknown>;
  const warnings: string[] = [];

  const { major, minor } = parseSchemaVersion(obj.schemaVersion);
  if (major !== SUPPORTED_MAJOR) {
    throw new Error(
      `Unsupported test suite schemaVersion major ${major}. This build supports major ${SUPPORTED_MAJOR}.`,
    );
  }
  if (minor > 0) {
    warnings.push(
      `Test suite schemaVersion minor ${minor} is newer than this build. Additive fields will be ignored.`,
    );
  }

  const status = obj.status === "reviewed" ? "reviewed" : "draft";
  if (status === "draft") {
    warnings.push(
      'Test suite status is "draft". Review scenarios before relying on results.',
    );
  }

  const agent = obj.agent as Record<string, unknown> | undefined;
  if (!agent || typeof agent !== "object") {
    throw new Error("Test suite is missing required field: agent.");
  }
  if (
    typeof agent.displayName !== "string" ||
    typeof agent.agentFolder !== "string" ||
    typeof agent.botSchemaName !== "string"
  ) {
    throw new Error(
      "agent.displayName, agent.agentFolder and agent.botSchemaName are required.",
    );
  }

  if (!Array.isArray(obj.scenarios)) {
    throw new Error("Test suite is missing required field: scenarios[].");
  }

  const seenIds = new Set<string>();
  const scenarios = obj.scenarios.map((s, i) => {
    if (!s || typeof s !== "object") {
      throw new Error(`scenarios[${i}] is not an object.`);
    }
    const sc = s as Record<string, unknown>;
    if (typeof sc.id !== "string" || !sc.id) {
      throw new Error(`scenarios[${i}].id is required.`);
    }
    if (seenIds.has(sc.id)) {
      throw new Error(`Duplicate scenario id "${sc.id}".`);
    }
    seenIds.add(sc.id);
    if (typeof sc.title !== "string" || !sc.title) {
      throw new Error(`scenarios[${i}].title is required.`);
    }
    if (!Array.isArray(sc.turns) || sc.turns.length === 0) {
      throw new Error(`scenarios[${i}].turns must be a non-empty array.`);
    }
    const turns = sc.turns.map((t, ti) => {
      if (
        !t ||
        typeof t !== "object" ||
        typeof (t as Record<string, unknown>).user !== "string"
      ) {
        throw new Error(`scenarios[${i}].turns[${ti}].user must be a string.`);
      }
      return { user: (t as Record<string, unknown>).user as string };
    });

    const expectedRaw = sc.expected as Record<string, unknown> | undefined;
    const expected = expectedRaw
      ? {
          mustContain: isStringArray(expectedRaw.mustContain)
            ? expectedRaw.mustContain
            : undefined,
          mustNotContain: isStringArray(expectedRaw.mustNotContain)
            ? expectedRaw.mustNotContain
            : undefined,
          mustMatch: isStringArray(expectedRaw.mustMatch)
            ? expectedRaw.mustMatch
            : undefined,
          expectedToolNames: isStringArray(expectedRaw.expectedToolNames)
            ? expectedRaw.expectedToolNames
            : undefined,
          judgeHints:
            expectedRaw.judgeHints && typeof expectedRaw.judgeHints === "object"
              ? (expectedRaw.judgeHints as Record<string, unknown>)
              : undefined,
        }
      : undefined;

    // Validate regex patterns up front.
    if (expected?.mustMatch) {
      for (const pattern of expected.mustMatch) {
        try {
          new RegExp(pattern);
        } catch (err) {
          throw new Error(
            `scenarios[${i}].expected.mustMatch contains invalid regex "${pattern}": ${(err as Error).message}`,
          );
        }
      }
    }

    const thresholdsRaw = sc.thresholds as Record<string, unknown> | undefined;
    const thresholds = thresholdsRaw
      ? {
          deterministicPassRequired:
            typeof thresholdsRaw.deterministicPassRequired === "boolean"
              ? thresholdsRaw.deterministicPassRequired
              : undefined,
          minimumOverallScore:
            typeof thresholdsRaw.minimumOverallScore === "number"
              ? thresholdsRaw.minimumOverallScore
              : undefined,
          minimumCriterionScore:
            thresholdsRaw.minimumCriterionScore &&
            typeof thresholdsRaw.minimumCriterionScore === "object"
              ? (thresholdsRaw.minimumCriterionScore as Record<string, number>)
              : undefined,
        }
      : undefined;

    const priority: "low" | "medium" | "high" | undefined =
      sc.priority === "low" ||
      sc.priority === "medium" ||
      sc.priority === "high"
        ? sc.priority
        : undefined;
    return {
      id: sc.id,
      title: sc.title,
      category: typeof sc.category === "string" ? sc.category : undefined,
      priority,
      turns,
      expected,
      rubric: isStringArray(sc.rubric) ? sc.rubric : undefined,
      thresholds,
      requireTrace:
        typeof sc.requireTrace === "boolean" ? sc.requireTrace : undefined,
    };
  });

  const defaultsRaw = obj.defaults as Record<string, unknown> | undefined;
  const defaults = defaultsRaw
    ? {
        freshConversationPerScenario:
          typeof defaultsRaw.freshConversationPerScenario === "boolean"
            ? defaultsRaw.freshConversationPerScenario
            : undefined,
        maxTurns:
          typeof defaultsRaw.maxTurns === "number"
            ? defaultsRaw.maxTurns
            : undefined,
        timeoutMs:
          typeof defaultsRaw.timeoutMs === "number"
            ? defaultsRaw.timeoutMs
            : undefined,
        maxParallelScenarios:
          typeof defaultsRaw.maxParallelScenarios === "number"
            ? defaultsRaw.maxParallelScenarios
            : undefined,
      }
    : undefined;

  const suite: TestSuite = {
    schemaVersion: obj.schemaVersion as string,
    status,
    agent: {
      displayName: agent.displayName as string,
      agentFolder: agent.agentFolder as string,
      botSchemaName: agent.botSchemaName as string,
    },
    defaults,
    scenarios,
  };

  return { value: suite, warnings };
}

export function parseRubric(input: unknown): ParseResult<Rubric> {
  if (!input || typeof input !== "object") {
    throw new Error("Rubric must be a JSON object.");
  }
  const obj = input as Record<string, unknown>;
  const warnings: string[] = [];
  const { major, minor } = parseSchemaVersion(obj.schemaVersion);
  if (major !== SUPPORTED_MAJOR) {
    throw new Error(`Unsupported rubric schemaVersion major ${major}.`);
  }
  if (minor > 0) {
    warnings.push(
      `Rubric schemaVersion minor ${minor} is newer than this build.`,
    );
  }

  if (!Array.isArray(obj.criteria) || obj.criteria.length === 0) {
    throw new Error("Rubric.criteria must be a non-empty array.");
  }

  const criteria = obj.criteria.map((c, i) => {
    if (!c || typeof c !== "object") {
      throw new Error(`criteria[${i}] is not an object.`);
    }
    const cr = c as Record<string, unknown>;
    if (
      typeof cr.id !== "string" ||
      typeof cr.label !== "string" ||
      typeof cr.scale !== "string" ||
      typeof cr.description !== "string"
    ) {
      throw new Error(
        `criteria[${i}] requires id, label, scale, and description (all strings).`,
      );
    }
    return {
      id: cr.id,
      label: cr.label,
      scale: cr.scale,
      description: cr.description,
    };
  });

  return {
    value: { schemaVersion: obj.schemaVersion as string, criteria },
    warnings,
  };
}
